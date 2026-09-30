import { Request } from 'express';
import prisma from './db.js';

export function isSuperAdmin(req: Request): boolean {
  return req.user?.type === 'staff' && req.user.role === 'SUPER_ADMIN';
}

/** Location assigned to the logged-in manager/staff (null for super admin / unassigned). */
export async function getStaffLocationId(req: Request): Promise<string | null> {
  if (!req.user || req.user.type !== 'staff' || req.user.role === 'SUPER_ADMIN') {
    return null;
  }
  const staff = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { locationId: true },
  });
  return staff?.locationId ?? null;
}

/**
 * Returns an error message when the staff user cannot touch this location.
 * Super admin always passes. Manager/staff must match their locationId.
 */
export async function assertLocationAccess(
  req: Request,
  locationId: string
): Promise<string | null> {
  if (isSuperAdmin(req)) return null;
  if (!req.user || req.user.type !== 'staff') {
    return 'Staff access required';
  }
  const staffLocationId = await getStaffLocationId(req);
  if (!staffLocationId) {
    return 'No location assigned to your account';
  }
  if (staffLocationId !== locationId) {
    return 'Access denied for this location';
  }
  return null;
}

/** Active manager for a location, if any. */
export async function findActiveManager(locationId: string) {
  return prisma.user.findFirst({
    where: { locationId, role: 'MANAGER', isActive: true },
    select: { id: true, email: true, name: true },
  });
}

/** Unused, unexpired manager invite for a location. */
export async function findPendingManagerInvite(locationId: string) {
  return prisma.inviteToken.findFirst({
    where: {
      locationId,
      role: 'MANAGER',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, email: true, token: true, expiresAt: true },
  });
}

/** Build admin accept-invite URL for a raw token. */
export function buildInviteLink(token: string): string {
  const adminUrl = process.env.ADMIN_URL || 'http://localhost:5173';
  return `${adminUrl}/accept-invite?token=${token}`;
}
