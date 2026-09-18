import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { emitNewOrder, emitOrderStatusUpdate } from '../lib/socket.js';
import { isPointInPolygon } from '../lib/geo.js';
import { sendEmail, orderConfirmationEmail, orderStatusEmail } from '../lib/email.js';
import { auditLog } from '../lib/audit.js';

const orderItemOptionSchema = z.object({
  menuOptionValueId: z.string().min(1),
  name: z.string().min(1),
  value: z.string().min(1),
  priceModifier: z.number(),
});

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1),
  comment: z.string().optional(),
  options: z.array(orderItemOptionSchema).optional(),
});

const createOrderSchema = z.object({
  // orderType: z.enum(['DELIVERY', 'PICKUP']),
  // Dine-in default; DELIVERY/PICKUP kept for legacy clients
  orderType: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']).optional().default('DINE_IN'),
  items: z.array(orderItemSchema).min(1),
  comment: z.string().optional(),
  // DINE-IN: scheduling / coupon / address / loyalty UI commented on FE — fields still accepted for legacy
  scheduledAt: z.string().optional(),
  couponCode: z.string().optional(),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).optional(),
  guestName: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  loyaltyPointsRedeem: z.number().int().min(0).optional(),
  // Kiosk orders send kioskId only. tableId from the client is ignored.
  kioskId: z.string().min(1).optional(),
});

const orderTableInclude = { select: { id: true, name: true } } as const;

async function resolveKioskTable(kioskId: string): Promise<
  | { tableId: string; locationId: string }
  | { error: string; status: number }
> {
  const kiosk = await prisma.tableKiosk.findUnique({
    where: { id: kioskId },
    include: { table: { select: { id: true, isActive: true, locationId: true } } },
  });
  if (!kiosk?.table) {
    return { error: 'Invalid table screen', status: 404 };
  }
  if (!kiosk.isActive || !kiosk.table.isActive) {
    return { error: 'This table screen is currently unavailable', status: 400 };
  }
  return { tableId: kiosk.table.id, locationId: kiosk.table.locationId };
}

function generateOrderNumber(): string {
  const prefix = 'KA';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const { orderType, items, comment, scheduledAt, address, guestName, guestEmail, guestPhone, loyaltyPointsRedeem, kioskId } = parsed.data;

  // Delivery-only: address required (DINE_IN / PICKUP skip)
  if (orderType === 'DELIVERY' && !address) {
    res.status(400).json({ success: false, error: 'Delivery address is required' });
    return;
  }

  // Get customer ID from auth if available
  const customerId = (req as any).user?.type === 'customer' ? (req as any).user.id : null;

  // Guest checkout: require name + email if not authenticated
  if (!customerId && !kioskId) {
    if (!guestName || !guestEmail) {
      res.status(400).json({ success: false, error: 'Guest name and email are required for guest checkout' });
      return;
    }
  }

  // Validate scheduledAt
  if (scheduledAt) {
    const scheduled = new Date(scheduledAt);
    const now = new Date();
    const minTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min in future
    const maxTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days out

    if (isNaN(scheduled.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid scheduledAt date' });
      return;
    }
    if (scheduled < minTime) {
      res.status(400).json({ success: false, error: 'Scheduled time must be at least 30 minutes in the future' });
      return;
    }
    if (scheduled > maxTime) {
      res.status(400).json({ success: false, error: 'Scheduled time cannot be more than 7 days in the future' });
      return;
    }
  }

  let resolvedTableId: string | null = null;
  let location;

  if (kioskId) {
    const resolved = await resolveKioskTable(kioskId);
    if ('error' in resolved) {
      res.status(resolved.status).json({ success: false, error: resolved.error });
      return;
    }
    resolvedTableId = resolved.tableId;
    location = await prisma.location.findFirst({
      where: { id: resolved.locationId, isActive: true },
      include: { operatingHours: true },
    });
    if (!location) {
      res.status(400).json({ success: false, error: 'This table screen is currently unavailable' });
      return;
    }
  } else {
    // Non-kiosk orders keep the existing default-location behavior.
    location = await prisma.location.findFirst({
      where: { isActive: true },
      include: { operatingHours: true },
    });
    if (!location) {
      res.status(400).json({ success: false, error: 'No active location found' });
      return;
    }
  }

  // Check busy mode
  if (location.isBusy) {
    res.status(400).json({
      success: false,
      error: location.busyMessage || 'This location is currently not accepting orders. Please try again later.',
    });
    return;
  }

  // Validate scheduledAt is within operating hours
  if (scheduledAt && location.operatingHours.length > 0) {
    const scheduled = new Date(scheduledAt);
    const dayOfWeek = scheduled.getDay();
    const timeStr = `${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`;
    const dayHours = location.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!dayHours || dayHours.isClosed) {
      res.status(400).json({ success: false, error: 'Location is closed on the scheduled day' });
      return;
    }
    if (timeStr < dayHours.openTime || timeStr >= dayHours.closeTime) {
      res.status(400).json({ success: false, error: `Scheduled time must be within operating hours (${dayHours.openTime} - ${dayHours.closeTime})` });
      return;
    }
  }

  // Delivery zone enforcement
  let deliveryFee = 0;
  if (orderType === 'DELIVERY') {
    if (address?.lat != null && address?.lng != null) {
      const zones = await prisma.deliveryZone.findMany({
        where: { locationId: location.id, isActive: true },
      });

      let matchedZone = null;
      for (const zone of zones) {
        if (zone.boundaries && Array.isArray(zone.boundaries)) {
          if (isPointInPolygon(address.lat, address.lng, zone.boundaries as [number, number][])) {
            matchedZone = zone;
            break;
          }
        }
      }

      if (zones.length > 0 && !matchedZone) {
        res.status(400).json({ success: false, error: 'Delivery address is outside our delivery zones' });
        return;
      }

      if (matchedZone) {
        deliveryFee = matchedZone.charge;
      } else {
        deliveryFee = 4.99; // Fallback if no zones configured
      }
    } else {
      // No coordinates provided — use fallback or first zone's charge
      const defaultZone = await prisma.deliveryZone.findFirst({
        where: { locationId: location.id, isActive: true },
        orderBy: { charge: 'asc' },
      });
      deliveryFee = defaultZone ? defaultZone.charge : 4.99;
    }
  }

  // Fetch menu items to validate and get prices
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: {
      options: { include: { values: true } },
    },
  });

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  // Validate all items exist and are active
  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      res.status(400).json({ success: false, error: `Menu item not found: ${item.menuItemId}` });
      return;
    }
    if (!menuItem.isActive) {
      res.status(400).json({ success: false, error: `Menu item is not available: ${menuItem.name}` });
      return;
    }
    if (menuItem.trackStock && menuItem.stockQty < item.quantity) {
      res.status(400).json({ success: false, error: `Insufficient stock for: ${menuItem.name}` });
      return;
    }
  }

  // Calculate totals
  let subtotal = 0;
  const orderItemsData = items.map((item) => {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    let unitPrice = menuItem.price;

    const optionsData = (item.options || []).map((opt) => {
      unitPrice += opt.priceModifier;
      return {
        menuOptionValueId: opt.menuOptionValueId,
        name: opt.name,
        value: opt.value,
        priceModifier: opt.priceModifier,
      };
    });

    const itemSubtotal = unitPrice * item.quantity;
    subtotal += itemSubtotal;

    return {
      menuItemId: item.menuItemId,
      name: menuItem.name,
      quantity: item.quantity,
      unitPrice,
      subtotal: itemSubtotal,
      comment: item.comment,
      options: { create: optionsData },
    };
  });

  // Loyalty points redemption
  let loyaltyDiscount = 0;
  if (loyaltyPointsRedeem && loyaltyPointsRedeem > 0 && customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.loyaltyPoints < loyaltyPointsRedeem) {
      res.status(400).json({ success: false, error: 'Insufficient loyalty points' });
      return;
    }
    // 100 points = $1
    loyaltyDiscount = loyaltyPointsRedeem / 100;
  }

  // Check minimum order for delivery zone
  if (orderType === 'DELIVERY' && address?.lat != null && address?.lng != null) {
    const zones = await prisma.deliveryZone.findMany({
      where: { locationId: location.id, isActive: true },
    });
    for (const zone of zones) {
      if (zone.boundaries && Array.isArray(zone.boundaries)) {
        if (isPointInPolygon(address.lat, address.lng, zone.boundaries as [number, number][])) {
          if (subtotal < zone.minOrder) {
            res.status(400).json({
              success: false,
              error: `Mindestbestellwert für diese Lieferzone: ${zone.minOrder.toFixed(2)} €`,
            });
            return;
          }
          break;
        }
      }
    }
  }

  const TAX_RATE = 0.08;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + deliveryFee - loyaltyDiscount;

  const order = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      customerId,
      locationId: location.id,
      orderType,
      // // Dine-in: start at CONFIRMED (Placed/PENDING skipped in UI). Legacy default was PENDING.
      // status: orderType === 'DINE_IN' ? 'CONFIRMED' : 'PENDING',
      // Start as PENDING (New) — staff confirms to CONFIRMED on kitchen display
      status: 'PENDING',
      subtotal,
      tax,
      deliveryFee,
      discount: loyaltyDiscount,
      total,
      comment,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      guestName: customerId ? undefined : guestName,
      guestEmail: customerId ? undefined : guestEmail,
      guestPhone: customerId ? undefined : guestPhone,
      tableId: resolvedTableId,
      items: { create: orderItemsData },
    },
    include: {
      items: { include: { options: true } },
      customer: { select: { id: true, name: true, email: true } },
      table: orderTableInclude,
    },
  });

  // Decrement stock for tracked items
  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    if (menuItem.trackStock) {
      await prisma.menuItem.update({
        where: { id: item.menuItemId },
        data: { stockQty: { decrement: item.quantity } },
      });
    }
  }

  // Earn loyalty points (1 point per $1 spent)
  if (customerId) {
    const pointsEarned = Math.floor(subtotal);
    if (pointsEarned > 0) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { increment: pointsEarned } },
      });
      await prisma.loyaltyTransaction.create({
        data: {
          customerId,
          type: 'EARN',
          points: pointsEarned,
          description: `Earned from order #${order.orderNumber}`,
          orderId: order.id,
        },
      });
    }

    // Redeem loyalty points
    if (loyaltyPointsRedeem && loyaltyPointsRedeem > 0) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { decrement: loyaltyPointsRedeem } },
      });
      await prisma.loyaltyTransaction.create({
        data: {
          customerId,
          type: 'REDEEM',
          points: -loyaltyPointsRedeem,
          description: `Redeemed on order #${order.orderNumber}`,
          orderId: order.id,
        },
      });
    }
  }

  // Send confirmation email
  const recipientEmail = order.customer?.email || guestEmail;
  if (recipientEmail) {
    const emailContent = orderConfirmationEmail({
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      total: order.total,
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal })),
    });
    sendEmail({ to: recipientEmail, ...emailContent }).catch(() => {});
  }

  emitNewOrder({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    orderType: order.orderType,
    table: order.table,
  });

  // Emit event for automation rules
  try {
    const { appEvents } = await import('../lib/events.js');
    appEvents.emit('order.created', { order });
  } catch {}

  res.status(201).json({ success: true, data: order });
}

const addOrderItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1),
});

/**
 * Dine-in "add more" creates a new kitchen order with its own status.
 * The original order is left unchanged so staff/admin can track each ticket separately.
 */
export async function addOrderItems(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = addOrderItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const { items } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const user = (req as any).user;
  if (user?.type === 'customer' && order.customerId && order.customerId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    res.status(400).json({ success: false, error: 'Cannot add items to a completed or cancelled order' });
    return;
  }

  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { options: { include: { values: true } } },
  });
  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      res.status(400).json({ success: false, error: `Menu item not found: ${item.menuItemId}` });
      return;
    }
    if (!menuItem.isActive) {
      res.status(400).json({ success: false, error: `Menu item is not available: ${menuItem.name}` });
      return;
    }
    if (menuItem.trackStock && menuItem.stockQty < item.quantity) {
      res.status(400).json({ success: false, error: `Insufficient stock for: ${menuItem.name}` });
      return;
    }
  }

  const orderItemsData = items.map((item) => {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    let unitPrice = menuItem.price;
    const optionsData = (item.options || []).map((opt) => {
      unitPrice += opt.priceModifier;
      return {
        menuOptionValueId: opt.menuOptionValueId,
        name: opt.name,
        value: opt.value,
        priceModifier: opt.priceModifier,
      };
    });
    const itemSubtotal = unitPrice * item.quantity;
    return {
      menuItemId: item.menuItemId,
      name: menuItem.name,
      quantity: item.quantity,
      unitPrice,
      subtotal: itemSubtotal,
      comment: item.comment,
      options: { create: optionsData },
    };
  });

  const subtotal = orderItemsData.reduce((sum, item) => sum + item.subtotal, 0);
  const TAX_RATE = 0.08;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const created = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      customerId: order.customerId,
      locationId: order.locationId,
      orderType: order.orderType,
      status: 'PENDING',
      subtotal,
      tax,
      deliveryFee: 0,
      discount: 0,
      total,
      guestName: order.guestName,
      guestEmail: order.guestEmail,
      guestPhone: order.guestPhone,
      tableId: order.tableId,
      items: { create: orderItemsData },
    },
    include: {
      items: { include: { options: true } },
      customer: { select: { id: true, name: true, email: true } },
      table: orderTableInclude,
    },
  });

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    if (menuItem.trackStock) {
      await prisma.menuItem.update({
        where: { id: item.menuItemId },
        data: { stockQty: { decrement: item.quantity } },
      });
    }
  }

  emitNewOrder({
    id: created.id,
    orderNumber: created.orderNumber,
    status: created.status,
    orderType: created.orderType,
    table: created.table,
  });

  try {
    const { appEvents } = await import('../lib/events.js');
    appEvents.emit('order.created', { order: created });
  } catch {}

  res.status(201).json({ success: true, data: created });
}

export async function listOrders(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const orderType = req.query.orderType as string | undefined;

  const includeItems = req.query.includeItems === 'true';

  const where: Record<string, unknown> = {};
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
  if (orderType) where.orderType = orderType;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
        table: orderTableInclude,
        _count: { select: { items: true } },
        ...(includeItems ? { items: { include: { options: true } } } : {}),
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getOrder(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      location: { select: { id: true, name: true } },
      table: orderTableInclude,
      items: {
        include: {
          menuItem: { select: { id: true, name: true, slug: true } },
          options: true,
        },
      },
    },
  });

  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  // const user = req.user!;
  // if (user.type !== 'staff' && order.customerId !== user.id) {
  // Guest tracking by order id (cuid); customers only own; staff all
  const user = req.user;
  if (user?.type === 'customer' && order.customerId && order.customerId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  res.json({ success: true, data: order });
}

export async function listCustomerOrders(req: Request, res: Response): Promise<void> {
  const customerId = req.user?.id;
  if (!customerId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where = { customerId };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        location: { select: { id: true, name: true } },
        table: orderTableInclude,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function updateOrderStatus(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body;

  // const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'CANCELLED'];
  const validStatuses = [
    'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED',
    // Legacy delivery/pickup statuses (kept for existing orders)
    'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'CANCELLED',
  ];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: { select: { email: true } } },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status },
    include: {
      items: { include: { options: true } },
    },
  });

  auditLog(req, { action: 'update', entity: 'Order', entityId: id, details: { status, previousStatus: order.status } });

  emitOrderStatusUpdate({
    id: updated.id,
    orderNumber: updated.orderNumber,
    status: updated.status,
    orderType: updated.orderType,
    customerId: updated.customerId,
  });

  // Send status update email
  const recipientEmail = order.customer?.email || order.guestEmail;
  if (recipientEmail) {
    const emailContent = orderStatusEmail({ orderNumber: order.orderNumber, status });
    sendEmail({ to: recipientEmail, ...emailContent }).catch(() => {});
  }

  // Emit event for automation rules
  try {
    const { appEvents } = await import('../lib/events.js');
    appEvents.emit('order.statusChanged', { order: updated, previousStatus: order.status });
  } catch {}

  res.json({ success: true, data: updated });
}

/** Customer/guest cancel — only while Confirmed (or Pending). Disabled once Preparing+. */
export async function cancelOrder(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { email: true } },
      table: { select: { id: true, name: true } },
    },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  // Ownership: staff always; customer if owns; guest orders allowed by id
  const user = req.user;
  if (user?.type === 'customer' && order.customerId && order.customerId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  if (!['CONFIRMED', 'PENDING'].includes(order.status)) {
    res.status(400).json({
      success: false,
      error: 'Order can only be cancelled while status is Confirmed',
    });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: {
      items: { include: { options: true } },
      table: { select: { id: true, name: true } },
    },
  });

  auditLog(req, { action: 'update', entity: 'Order', entityId: id, details: { status: 'CANCELLED', previousStatus: order.status } });

  emitOrderStatusUpdate({
    id: updated.id,
    orderNumber: updated.orderNumber,
    status: updated.status,
    orderType: updated.orderType,
    customerId: updated.customerId,
    table: updated.table,
    items: updated.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    cancelledByCustomer: true,
  });

  const recipientEmail = order.customer?.email || order.guestEmail;
  if (recipientEmail) {
    const emailContent = orderStatusEmail({ orderNumber: order.orderNumber, status: 'CANCELLED' });
    sendEmail({ to: recipientEmail, ...emailContent }).catch(() => {});
  }

  res.json({ success: true, data: updated });
}
