import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/db.js';
import { emitKioskCartUpdated, emitKioskSessionUpdated } from '../lib/socket.js';

const cartItemOptionSchema = z.object({
  optionId: z.string(),
  optionName: z.string(),
  valueId: z.string(),
  valueName: z.string(),
  priceModifier: z.number(),
});

const cartItemSchema = z.object({
  id: z.string().min(1),
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
  options: z.array(cartItemOptionSchema).default([]),
  comment: z.string().optional(),
});

const putCartSchema = z.object({
  items: z.array(cartItemSchema),
});

async function resolveActiveKiosk(kioskId: string) {
  return prisma.tableKiosk.findUnique({
    where: { id: kioskId },
    select: {
      id: true,
      isActive: true,
      tableId: true,
      table: { select: { id: true, name: true } },
    },
  });
}

function parseCartItems(raw: unknown) {
  const parsed = z.array(cartItemSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** GET /api/table-kiosks/:id/cart — shared draft cart for this table screen */
export async function getTableKioskCart(req: Request<{ id: string }>, res: Response): Promise<void> {
  const kiosk = await resolveActiveKiosk(req.params.id);
  if (!kiosk || !kiosk.isActive) {
    res.status(404).json({ success: false, error: 'Table screen not found' });
    return;
  }

  const cart = await prisma.tableCart.findUnique({ where: { kioskId: kiosk.id } });
  res.json({
    success: true,
    data: {
      kioskId: kiosk.id,
      items: cart ? parseCartItems(cart.items) : [],
      updatedAt: cart?.updatedAt ?? null,
    },
  });
}

/** PUT /api/table-kiosks/:id/cart — replace shared cart (all devices sync) */
export async function putTableKioskCart(req: Request<{ id: string }>, res: Response): Promise<void> {
  const parsed = putCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const kiosk = await resolveActiveKiosk(req.params.id);
  if (!kiosk || !kiosk.isActive) {
    res.status(404).json({ success: false, error: 'Table screen not found' });
    return;
  }

  const cart = await prisma.tableCart.upsert({
    where: { kioskId: kiosk.id },
    create: { kioskId: kiosk.id, items: parsed.data.items as Prisma.InputJsonValue },
    update: { items: parsed.data.items as Prisma.InputJsonValue },
  });

  const items = parseCartItems(cart.items);
  emitKioskCartUpdated(kiosk.id, items);

  res.json({
    success: true,
    data: {
      kioskId: kiosk.id,
      items,
      updatedAt: cart.updatedAt,
    },
  });
}

/** Clear draft cart after place-order (called from order controller too). */
export async function clearTableKioskCart(kioskId: string): Promise<void> {
  await prisma.tableCart.upsert({
    where: { kioskId },
    create: { kioskId, items: [] as Prisma.InputJsonValue },
    update: { items: [] as Prisma.InputJsonValue },
  });
  emitKioskCartUpdated(kioskId, []);
}

const OPEN_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'SERVED',
  'OUT_FOR_DELIVERY',
] as const;

/**
 * GET /api/table-kiosks/:id/session
 * Shared cart + open dine-in orders for this table (all devices see the same).
 */
export async function getTableKioskSession(req: Request<{ id: string }>, res: Response): Promise<void> {
  const kiosk = await resolveActiveKiosk(req.params.id);
  if (!kiosk || !kiosk.isActive) {
    res.status(404).json({ success: false, error: 'Table screen not found' });
    return;
  }

  // Orders must load even if TableCart table/client is missing (migration lag).
  let cart: { items: unknown; updatedAt: Date } | null = null;
  try {
    cart = await prisma.tableCart.findUnique({ where: { kioskId: kiosk.id } });
  } catch {
    cart = null;
  }

  const orders = await prisma.order.findMany({
    where: {
      tableId: kiosk.tableId,
      status: { in: [...OPEN_STATUSES] },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      items: { include: { options: true } },
      table: { select: { id: true, name: true } },
    },
  });

  res.json({
    success: true,
    data: {
      kioskId: kiosk.id,
      table: kiosk.table,
      cart: {
        items: cart ? parseCartItems(cart.items) : [],
        updatedAt: cart?.updatedAt ?? null,
      },
      orders,
    },
  });
}

export function notifyKioskSession(kioskId: string): void {
  emitKioskSessionUpdated(kioskId);
}
