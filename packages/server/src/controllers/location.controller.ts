import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { auditLog } from '../lib/audit.js';
import { createAndSendInvite } from './staff.controller.js';
import {
  assertLocationAccess,
  buildInviteLink,
  findPendingManagerInvite,
  getStaffLocationId,
  isSuperAdmin,
} from '../lib/locationScope.js';

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

/** Empty string → undefined so optional email fields don't fail Zod. */
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().email().optional()
);

const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional()
);

const createLocationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: optionalString,
  phone: optionalString,
  email: optionalEmail,
  address: z.string().min(1),
  city: z.string().min(1),
  state: optionalString,
  postalCode: z.string().min(1),
  country: z.string().default('US'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  image: optionalString,
  isActive: z.boolean().default(true),
  deliveryEnabled: z.boolean().default(true),
  pickupEnabled: z.boolean().default(true),
  minOrderDelivery: z.number().min(0).default(0),
  minOrderPickup: z.number().min(0).default(0),
  deliveryLeadTime: z.number().int().min(0).default(30),
  pickupLeadTime: z.number().int().min(0).default(15),
  isBusy: z.boolean().optional(),
  busyMessage: z.string().nullable().optional(),
  operatingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: z.string().regex(/^\d{2}:\d{2}$/),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/),
    isClosed: z.boolean().default(false),
  })).optional(),
  /** Required — invites the dedicated restaurant manager. */
  managerEmail: z.string().email(),
  managerName: optionalString,
  /** Optional initial staff invite for this restaurant. */
  staffEmail: optionalEmail,
  staffName: optionalString,
});

const updateLocationSchema = createLocationSchema
  .partial()
  .omit({ slug: true, managerEmail: true, managerName: true, staffEmail: true, staffName: true });

// ============================================================
// HANDLERS
// ============================================================

export async function listLocations(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (req.user?.type === 'staff' && req.user.role !== 'SUPER_ADMIN') {
    const staffLocationId = await getStaffLocationId(req);
    if (!staffLocationId) {
      res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit, total: 0, totalPages: 0 },
      });
      return;
    }
    where.id = staffLocationId;
  }

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        operatingHours: { orderBy: { dayOfWeek: 'asc' } },
        _count: { select: { deliveryZones: true, tables: true, orders: true } },
        staff: {
          where: { role: 'MANAGER', isActive: true },
          select: { id: true, email: true, name: true },
          take: 1,
        },
      },
    }),
    prisma.location.count({ where }),
  ]);

  res.json({
    success: true,
    data: locations,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function getLocation(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const scopeError = await assertLocationAccess(req, id);
  // Public/customer reads: no staff user → allow. Staff without access → block.
  if (req.user?.type === 'staff' && scopeError) {
    res.status(403).json({ success: false, error: scopeError });
    return;
  }

  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      operatingHours: { orderBy: { dayOfWeek: 'asc' } },
      deliveryZones: { orderBy: { name: 'asc' } },
      tables: { orderBy: { name: 'asc' } },
      staff: {
        where: { role: { in: ['MANAGER', 'STAFF'] } },
        select: { id: true, email: true, name: true, role: true, isActive: true },
        orderBy: { role: 'asc' },
      },
      _count: { select: { orders: true, reservations: true, menuItems: true } },
    },
  });

  if (!location) {
    res.status(404).json({ success: false, error: 'Location not found' });
    return;
  }

  // Staff only: expose pending manager invite + recoverable link (local SMTP often fails)
  let pendingManagerInvite: {
    id: string;
    email: string;
    expiresAt: Date;
    inviteLink: string;
  } | null = null;

  if (req.user?.type === 'staff') {
    const pending = await findPendingManagerInvite(id);
    if (pending) {
      pendingManagerInvite = {
        id: pending.id,
        email: pending.email,
        expiresAt: pending.expiresAt,
        inviteLink: buildInviteLink(pending.token),
      };
    }
  }

  res.json({
    success: true,
    data: {
      ...location,
      pendingManagerInvite,
    },
  });
}

export async function createLocation(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ success: false, error: 'Only super admin can create locations' });
    return;
  }

  const parsed = createLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const { operatingHours, managerEmail, managerName, staffEmail, staffName, ...data } = parsed.data;

  if (staffEmail && staffEmail.toLowerCase() === managerEmail.toLowerCase()) {
    res.status(400).json({ success: false, error: 'Manager and staff must use different emails' });
    return;
  }

  const existing = await prisma.location.findUnique({ where: { slug: data.slug } });
  if (existing) {
    res.status(409).json({ success: false, error: 'A location with this slug already exists' });
    return;
  }

  const existingManager = await prisma.user.findUnique({ where: { email: managerEmail } });
  if (existingManager) {
    res.status(409).json({ success: false, error: 'A user with this manager email already exists' });
    return;
  }

  if (staffEmail) {
    const existingStaff = await prisma.user.findUnique({ where: { email: staffEmail } });
    if (existingStaff) {
      res.status(409).json({ success: false, error: 'A user with this staff email already exists' });
      return;
    }
  }

  const location = await prisma.location.create({
    data: {
      ...data,
      operatingHours: operatingHours
        ? {
            create: operatingHours,
          }
        : undefined,
    },
    include: {
      operatingHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  });

  type InviteSummary = {
    id: string;
    email: string;
    expiresAt: Date;
    inviteLink: string;
    emailSent: boolean;
    emailError: string | null;
  };

  let managerInvite: InviteSummary | null = null;
  let staffInvite: InviteSummary | null = null;
  let managerInviteError: string | null = null;
  let staffInviteError: string | null = null;

  try {
    const result = await createAndSendInvite({
      email: managerEmail,
      role: 'MANAGER',
      locationId: location.id,
      invitedBy: req.user!.id,
      req,
    });
    managerInvite = {
      id: result.invite.id,
      email: result.invite.email,
      expiresAt: result.invite.expiresAt,
      inviteLink: result.inviteLink,
      emailSent: result.emailSent,
      emailError: result.emailError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown invite error';
    console.error('Failed to create manager invite:', err);
    managerInviteError = message;
  }

  if (staffEmail) {
    try {
      const result = await createAndSendInvite({
        email: staffEmail,
        role: 'STAFF',
        locationId: location.id,
        invitedBy: req.user!.id,
        req,
      });
      staffInvite = {
        id: result.invite.id,
        email: result.invite.email,
        expiresAt: result.invite.expiresAt,
        inviteLink: result.inviteLink,
        emailSent: result.emailSent,
        emailError: result.emailError,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown invite error';
      console.error('Failed to create staff invite:', err);
      staffInviteError = message;
    }
  }

  auditLog(req, {
    action: 'create',
    entity: 'Location',
    entityId: location.id,
    details: { name: location.name, managerEmail, managerName, staffEmail, staffName },
  });

  res.status(201).json({
    success: true,
    data: {
      ...location,
      managerInvite,
      staffInvite,
      managerInviteError,
      staffInviteError,
      managerName: managerName || null,
      staffName: staffName || null,
    },
  });
}

export async function updateLocation(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const scopeError = await assertLocationAccess(req, id);
  if (scopeError) {
    res.status(403).json({ success: false, error: scopeError });
    return;
  }

  const parsed = updateLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Location not found' });
    return;
  }

  const { operatingHours, ...data } = parsed.data;

  const location = await prisma.location.update({
    where: { id },
    data: {
      ...data,
      operatingHours: operatingHours
        ? {
            deleteMany: {},
            create: operatingHours,
          }
        : undefined,
    },
    include: {
      operatingHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  });

  auditLog(req, { action: 'update', entity: 'Location', entityId: id, details: data });

  res.json({ success: true, data: location });
}

export async function deleteLocation(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  if (!isSuperAdmin(req)) {
    res.status(403).json({ success: false, error: 'Only super admin can delete locations' });
    return;
  }

  const existing = await prisma.location.findUnique({ where: { id } });

  if (!existing) {
    res.status(404).json({ success: false, error: 'Location not found' });
    return;
  }

  const orderCount = await prisma.order.count({ where: { locationId: id } });

  if (orderCount > 0) {
    res.status(409).json({
      success: false,
      error: 'Cannot delete location with existing orders. Deactivate it instead.',
    });
    return;
  }

  await prisma.location.delete({ where: { id } });
  auditLog(req, { action: 'delete', entity: 'Location', entityId: id, details: { name: existing.name } });
  res.json({ success: true, message: 'Location deleted' });
}
