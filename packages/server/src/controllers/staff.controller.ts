import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/db.js';
import { generateToken } from '../middleware/auth.js';
import { sendEmail, staffInvitationEmail } from '../lib/email.js';
import { auditLog } from '../lib/audit.js';
import {
  findActiveManager,
  findPendingManagerInvite,
  getStaffLocationId,
  isSuperAdmin,
} from '../lib/locationScope.js';

// ============================================================
// LIST STAFF
// ============================================================

export async function listStaff(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const role = req.query.role as string | undefined;
  const search = req.query.search as string | undefined;
  const isActive = req.query.isActive as string | undefined;

  const where: Record<string, unknown> = {};
  if (role && ['SUPER_ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
    where.role = role;
  }
  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Managers only see users for their restaurant
  if (!isSuperAdmin(req)) {
    const locationId = await getStaffLocationId(req);
    if (!locationId) {
      res.status(403).json({ success: false, error: 'No location assigned to your account' });
      return;
    }
    where.locationId = locationId;
  }

  const [staff, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        locationId: true,
        location: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: staff,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ============================================================
// GET STAFF
// ============================================================

export async function getStaff(req: Request<{ id: string }>, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      isActive: true,
      locationId: true,
      location: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ success: false, error: 'Staff member not found' });
    return;
  }

  if (!isSuperAdmin(req)) {
    const locationId = await getStaffLocationId(req);
    if (!locationId || user.locationId !== locationId) {
      res.status(403).json({ success: false, error: 'Access denied for this staff member' });
      return;
    }
  }

  res.json({ success: true, data: user });
}

// ============================================================
// UPDATE STAFF
// ============================================================

const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['SUPER_ADMIN', 'MANAGER', 'STAFF']).optional(),
  phone: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function updateStaff(req: Request<{ id: string }>, res: Response): Promise<void> {
  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const targetId = req.params.id;

  // Prevent self-demotion
  if (req.user!.id === targetId && parsed.data.role && parsed.data.role !== req.user!.role) {
    res.status(400).json({ success: false, error: 'Cannot change your own role' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Staff member not found' });
    return;
  }

  const actorIsAdmin = isSuperAdmin(req);

  if (!actorIsAdmin) {
    const locationId = await getStaffLocationId(req);
    if (!locationId || existing.locationId !== locationId) {
      res.status(403).json({ success: false, error: 'Access denied for this staff member' });
      return;
    }
    // Managers may only manage STAFF in their restaurant
    if (existing.role !== 'STAFF') {
      res.status(403).json({ success: false, error: 'Managers can only update staff members' });
      return;
    }
    if (parsed.data.role && parsed.data.role !== 'STAFF') {
      res.status(403).json({ success: false, error: 'Managers cannot change roles' });
      return;
    }
    if (parsed.data.locationId !== undefined && parsed.data.locationId !== locationId) {
      res.status(403).json({ success: false, error: 'Cannot move staff to another location' });
      return;
    }
    // Force location stay put
    delete (parsed.data as { locationId?: string | null }).locationId;
  }

  // 1 active manager per location when promoting / assigning
  if (parsed.data.role === 'MANAGER' || (existing.role === 'MANAGER' && parsed.data.locationId)) {
    const targetLocationId =
      parsed.data.locationId !== undefined ? parsed.data.locationId : existing.locationId;
    if (targetLocationId) {
      const activeManager = await findActiveManager(targetLocationId);
      if (activeManager && activeManager.id !== targetId) {
        res.status(409).json({
          success: false,
          error: 'This location already has an active manager. Deactivate them first.',
        });
        return;
      }
    }
  }

  if (existing.role === 'MANAGER' && parsed.data.isActive === true && existing.locationId) {
    const activeManager = await findActiveManager(existing.locationId);
    if (activeManager && activeManager.id !== targetId) {
      res.status(409).json({
        success: false,
        error: 'This location already has an active manager. Deactivate them first.',
      });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      isActive: true,
      locationId: true,
      location: { select: { id: true, name: true } },
    },
  });

  auditLog(req, { action: 'update', entity: 'Staff', entityId: targetId, details: parsed.data });

  res.json({ success: true, data: user });
}

// ============================================================
// DEACTIVATE STAFF
// ============================================================

export async function deactivateStaff(req: Request<{ id: string }>, res: Response): Promise<void> {
  const targetId = req.params.id;

  if (req.user!.id === targetId) {
    res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Staff member not found' });
    return;
  }

  if (!isSuperAdmin(req)) {
    const locationId = await getStaffLocationId(req);
    if (!locationId || existing.locationId !== locationId || existing.role !== 'STAFF') {
      res.status(403).json({ success: false, error: 'Managers can only deactivate staff in their location' });
      return;
    }
  }

  await prisma.user.update({
    where: { id: targetId },
    data: { isActive: false },
  });

  auditLog(req, { action: 'update', entity: 'Staff', entityId: targetId, details: { isActive: false } });

  res.json({ success: true, data: { message: 'Staff member deactivated' } });
}

// ============================================================
// INVITE HELPERS
// ============================================================

export async function createAndSendInvite(opts: {
  email: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'STAFF';
  locationId: string | null;
  invitedBy: string;
  req: Request;
}) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await prisma.inviteToken.create({
    data: {
      token,
      email: opts.email,
      role: opts.role,
      locationId: opts.locationId,
      invitedBy: opts.invitedBy,
      expiresAt,
    },
  });

  const adminUrl = process.env.ADMIN_URL || 'http://localhost:5173';
  const inviteLink = `${adminUrl}/accept-invite?token=${token}`;
  const emailContent = staffInvitationEmail({ email: opts.email, role: opts.role, inviteLink });
  const mailResult = await sendEmail({ to: opts.email, ...emailContent });

  auditLog(opts.req, {
    action: 'create',
    entity: 'Staff',
    entityId: invite.id,
    details: {
      email: opts.email,
      role: opts.role,
      locationId: opts.locationId,
      emailSent: mailResult.sent,
      emailError: mailResult.error,
    },
  });

  return {
    invite,
    inviteLink,
    emailSent: mailResult.sent,
    emailError: mailResult.error ?? null,
  };
}

// ============================================================
// INVITE STAFF
// ============================================================

const inviteStaffSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'MANAGER', 'STAFF']).optional(),
  locationId: z.string().optional(),
});

export async function inviteStaff(req: Request, res: Response): Promise<void> {
  const parsed = inviteStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const actorIsAdmin = isSuperAdmin(req);
  let role = parsed.data.role || 'STAFF';
  let locationId: string | null = parsed.data.locationId ?? null;

  if (!actorIsAdmin) {
    // Managers may only invite STAFF for their own restaurant
    if (role !== 'STAFF') {
      res.status(403).json({ success: false, error: 'Managers can only invite staff members' });
      return;
    }
    const managerLocationId = await getStaffLocationId(req);
    if (!managerLocationId) {
      res.status(403).json({ success: false, error: 'No location assigned to your account' });
      return;
    }
    locationId = managerLocationId;
    role = 'STAFF';
  } else {
    // Super admin: SUPER_ADMIN invites need no location; MANAGER/STAFF need a location
    if (role === 'SUPER_ADMIN') {
      locationId = null;
    } else if (!locationId) {
      res.status(400).json({ success: false, error: 'locationId is required for manager and staff invites' });
      return;
    } else {
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) {
        res.status(404).json({ success: false, error: 'Location not found' });
        return;
      }
    }
  }

  const { email } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ success: false, error: 'A user with this email already exists' });
    return;
  }

  if (role === 'MANAGER' && locationId) {
    const activeManager = await findActiveManager(locationId);
    if (activeManager) {
      res.status(409).json({
        success: false,
        error: `This location already has an active manager (${activeManager.email}). Deactivate them before inviting a replacement.`,
      });
      return;
    }
    const pending = await findPendingManagerInvite(locationId);
    if (pending) {
      res.status(409).json({
        success: false,
        error: `A pending manager invite already exists for ${pending.email}`,
      });
      return;
    }
  }

  const result = await createAndSendInvite({
    email,
    role,
    locationId,
    invitedBy: req.user!.id,
    req,
  });

  res.status(201).json({
    success: true,
    data: {
      id: result.invite.id,
      email: result.invite.email,
      role: result.invite.role,
      locationId: result.invite.locationId,
      expiresAt: result.invite.expiresAt,
      inviteLink: result.inviteLink,
      emailSent: result.emailSent,
      emailError: result.emailError,
    },
  });
}

// ============================================================
// VALIDATE INVITE TOKEN
// ============================================================

export async function validateInviteToken(req: Request<{ token: string }>, res: Response): Promise<void> {
  const invite = await prisma.inviteToken.findUnique({
    where: { token: req.params.token },
    include: { location: { select: { id: true, name: true } } },
  });

  if (!invite) {
    res.status(404).json({ success: false, error: 'Invalid invite token' });
    return;
  }

  if (invite.usedAt) {
    res.status(400).json({ success: false, error: 'This invite has already been used' });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(400).json({ success: false, error: 'This invite has expired' });
    return;
  }

  res.json({
    success: true,
    data: {
      email: invite.email,
      role: invite.role,
      locationId: invite.locationId,
      locationName: invite.location?.name ?? null,
    },
  });
}

// ============================================================
// ACCEPT INVITE
// ============================================================

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(6),
});

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const { token, name, password } = parsed.data;

  const invite = await prisma.inviteToken.findUnique({ where: { token } });
  if (!invite) {
    res.status(404).json({ success: false, error: 'Invalid invite token' });
    return;
  }

  if (invite.usedAt) {
    res.status(400).json({ success: false, error: 'This invite has already been used' });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(400).json({ success: false, error: 'This invite has expired' });
    return;
  }

  if (invite.role === 'MANAGER' && invite.locationId) {
    const activeManager = await findActiveManager(invite.locationId);
    if (activeManager) {
      res.status(409).json({
        success: false,
        error: 'This location already has an active manager',
      });
      return;
    }
  }

  if ((invite.role === 'MANAGER' || invite.role === 'STAFF') && !invite.locationId) {
    res.status(400).json({ success: false, error: 'Invite is missing a location assignment' });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    res.status(409).json({ success: false, error: 'A user with this email already exists' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: invite.email,
        password: hashedPassword,
        name,
        role: invite.role,
        locationId: invite.locationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        location: { select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const jwt = generateToken({
    id: user.id,
    email: user.email,
    type: 'staff',
    role: user.role,
  });

  res.status(201).json({ success: true, data: { token: jwt, user } });
}
