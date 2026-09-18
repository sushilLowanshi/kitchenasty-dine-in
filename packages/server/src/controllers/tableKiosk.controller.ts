import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';

const createKioskSchema = z.object({
  tableId: z.string().min(1),
});

const updateKioskSchema = z.object({
  isActive: z.boolean(),
});

const tableSelect = {
  id: true,
  name: true,
  locationId: true,
  isActive: true,
} as const;

function kioskPath(id: string): string {
  return `/t/${id}`;
}

function storefrontBase(): string | null {
  const configured = process.env.STOREFRONT_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  // STOREFRONT_URL is the source of truth. If it is unset in local dev, use the
  // storefront origin already listed in CORS so Open Screen is not a bare path.
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const storefront = origins.find((origin) => {
    try {
      return new URL(origin).port === '5174';
    } catch {
      return false;
    }
  });
  return storefront || (origins.length === 1 ? origins[0] : null);
}

function kioskUrl(id: string): string | null {
  const base = storefrontBase();
  return base ? `${base}${kioskPath(id)}` : null;
}

function publicKiosk(kiosk: {
  id: string;
  isActive: boolean;
  createdAt: Date;
  table: { id: string; name: string; locationId?: string };
}) {
  return {
    id: kiosk.id,
    isActive: kiosk.isActive,
    createdAt: kiosk.createdAt,
    path: kioskPath(kiosk.id),
    url: kioskUrl(kiosk.id),
    table: {
      id: kiosk.table.id,
      name: kiosk.table.name,
      locationId: kiosk.table.locationId,
    },
  };
}

/** Staff assigned to a location can only manage that restaurant's tables. */
async function locationScopeError(userId: string, role: string | undefined, tableLocationId: string): Promise<string | null> {
  if (role === 'SUPER_ADMIN') return null;
  const staff = await prisma.user.findUnique({
    where: { id: userId },
    select: { locationId: true },
  });
  if (staff?.locationId && staff.locationId !== tableLocationId) {
    return 'Table belongs to another location';
  }
  return null;
}

export async function createTableKiosk(req: Request, res: Response): Promise<void> {
  const parsed = createKioskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const table = await prisma.table.findUnique({
    where: { id: parsed.data.tableId },
    select: tableSelect,
  });
  if (!table) {
    res.status(404).json({ success: false, error: 'Table not found' });
    return;
  }
  if (!table.isActive) {
    res.status(400).json({ success: false, error: 'Table is not active' });
    return;
  }

  const scopeError = await locationScopeError(req.user!.id, req.user!.role, table.locationId);
  if (scopeError) {
    res.status(403).json({ success: false, error: scopeError });
    return;
  }

  const existing = await prisma.tableKiosk.findUnique({ where: { tableId: table.id } });
  if (existing) {
    res.status(409).json({ success: false, error: 'This table already has a table screen' });
    return;
  }

  const kiosk = await prisma.tableKiosk.create({
    data: { tableId: table.id },
    include: { table: { select: { id: true, name: true } } },
  });

  res.status(201).json({ success: true, data: publicKiosk(kiosk) });
}

export async function getTableKiosk(req: Request<{ id: string }>, res: Response): Promise<void> {
  const kiosk = await prisma.tableKiosk.findUnique({
    where: { id: req.params.id },
    include: { table: { select: { id: true, name: true, isActive: true, locationId: true } } },
  });
  if (!kiosk || !kiosk.table.isActive) {
    res.status(404).json({ success: false, error: 'Table screen not found' });
    return;
  }

  res.json({ success: true, data: publicKiosk(kiosk) });
}

export async function updateTableKiosk(req: Request<{ id: string }>, res: Response): Promise<void> {
  const parsed = updateKioskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const kiosk = await prisma.tableKiosk.findUnique({
    where: { id: req.params.id },
    include: { table: { select: tableSelect } },
  });
  if (!kiosk) {
    res.status(404).json({ success: false, error: 'Table screen not found' });
    return;
  }

  const scopeError = await locationScopeError(req.user!.id, req.user!.role, kiosk.table.locationId);
  if (scopeError) {
    res.status(403).json({ success: false, error: scopeError });
    return;
  }

  const updated = await prisma.tableKiosk.update({
    where: { id: kiosk.id },
    data: { isActive: parsed.data.isActive },
    include: { table: { select: { id: true, name: true } } },
  });

  res.json({ success: true, data: publicKiosk(updated) });
}

/** Staff list so admin can show which tables already have a screen. */
export async function listTableKiosks(req: Request, res: Response): Promise<void> {
  const requestedLocationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  let locationId = requestedLocationId;

  if (req.user?.role !== 'SUPER_ADMIN') {
    const staff = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { locationId: true },
    });
    if (staff?.locationId) {
      if (requestedLocationId && requestedLocationId !== staff.locationId) {
        res.status(403).json({ success: false, error: 'Cannot list table screens for another location' });
        return;
      }
      locationId = staff.locationId;
    }
  }

  const kiosks = await prisma.tableKiosk.findMany({
    where: locationId ? { table: { locationId } } : undefined,
    orderBy: { createdAt: 'asc' },
    include: {
      table: { select: { id: true, name: true, locationId: true } },
    },
  });

  res.json({
    success: true,
    data: kiosks.map((kiosk) => ({
      ...publicKiosk(kiosk),
      table: {
        id: kiosk.table.id,
        name: kiosk.table.name,
        locationId: kiosk.table.locationId,
      },
    })),
  });
}
