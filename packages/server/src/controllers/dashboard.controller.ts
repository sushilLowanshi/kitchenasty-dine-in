import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/db.js';
import { getStaffLocationId } from '../lib/locationScope.js';

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const staffLocationId = await getStaffLocationId(req);
  const locFilter = staffLocationId ? { locationId: staffLocationId } : {};

  const [
    ordersToday,
    revenueToday,
    ordersThisWeek,
    revenueThisWeek,
    ordersThisMonth,
    revenueThisMonth,
    totalOrders,
    totalRevenue,
    activeItems,
    totalCustomers,
    pendingReservations,
    pendingReviews,
    pendingOrders,
    recentOrders,
    topItems,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: todayStart }, ...locFilter } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: todayStart }, status: { not: 'CANCELLED' }, ...locFilter },
      _sum: { total: true },
    }),
    prisma.order.count({ where: { createdAt: { gte: weekStart }, ...locFilter } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: weekStart }, status: { not: 'CANCELLED' }, ...locFilter },
      _sum: { total: true },
    }),
    prisma.order.count({ where: { createdAt: { gte: monthStart }, ...locFilter } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: monthStart }, status: { not: 'CANCELLED' }, ...locFilter },
      _sum: { total: true },
    }),
    prisma.order.count({ where: locFilter }),
    prisma.order.aggregate({
      where: { status: { not: 'CANCELLED' }, ...locFilter },
      _sum: { total: true },
    }),
    prisma.menuItem.count({
      where: { isActive: true, ...(staffLocationId ? { locationId: staffLocationId } : {}) },
    }),
    // Customers are global; location staff still see platform count for now
    prisma.customer.count(),
    prisma.reservation.count({ where: { status: 'PENDING', ...locFilter } }),
    prisma.review.count({
      where: {
        isApproved: false,
        ...(staffLocationId ? { locationId: staffLocationId } : {}),
      },
    }),
    prisma.order.count({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, ...locFilter },
    }),
    prisma.order.findMany({
      take: 5,
      where: locFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        orderType: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    }),
    staffLocationId
      ? prisma.orderItem.groupBy({
          by: ['menuItemId', 'name'],
          where: { order: { locationId: staffLocationId } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        })
      : prisma.orderItem.groupBy({
          by: ['menuItemId', 'name'],
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
  ]);

  res.json({
    success: true,
    data: {
      pendingOrders,
      metrics: {
        ordersToday,
        revenueToday: revenueToday._sum.total || 0,
        ordersThisWeek,
        revenueThisWeek: revenueThisWeek._sum.total || 0,
        ordersThisMonth,
        revenueThisMonth: revenueThisMonth._sum.total || 0,
        totalOrders,
        totalRevenue: totalRevenue._sum.total || 0,
        activeItems,
        totalCustomers,
        pendingReservations,
        pendingReviews,
      },
      recentOrders,
      topItems: topItems.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        totalQuantity: item._sum.quantity || 0,
      })),
    },
  });
}

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const days = Math.min(90, Math.max(7, parseInt(req.query.days as string) || 30));
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const staffLocationId = await getStaffLocationId(req);
  const locationSql = staffLocationId
    ? Prisma.sql`AND "locationId" = ${staffLocationId}`
    : Prisma.empty;
  const orderWhere: Prisma.OrderWhereInput = {
    createdAt: { gte: startDate },
    ...(staffLocationId ? { locationId: staffLocationId } : {}),
  };

  const dailyStats = await prisma.$queryRaw<{ date: string; orders: bigint; revenue: number }[]>(
    Prisma.sql`
      SELECT
        TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS orders,
        COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0) AS revenue
      FROM "orders"
      WHERE "createdAt" >= ${startDate} ${locationSql}
      GROUP BY "createdAt"::date
      ORDER BY "createdAt"::date
    `
  );

  const orderTypeDistribution = await prisma.order.groupBy({
    by: ['orderType'],
    where: orderWhere,
    _count: true,
  });

  const orderStatusDistribution = await prisma.order.groupBy({
    by: ['status'],
    where: orderWhere,
    _count: true,
  });

  const hourlyDistribution = await prisma.$queryRaw<{ hour: number; orders: bigint }[]>(
    Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM "createdAt")::int AS hour,
        COUNT(*)::bigint AS orders
      FROM "orders"
      WHERE "createdAt" >= ${startDate} ${locationSql}
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY hour
    `
  );

  const categoryRevenue = await prisma.$queryRaw<{ name: string; revenue: number; orders: bigint }[]>(
    staffLocationId
      ? Prisma.sql`
          SELECT
            c.name,
            COALESCE(SUM(oi.subtotal), 0) AS revenue,
            COUNT(DISTINCT o.id)::bigint AS orders
          FROM "order_items" oi
          JOIN "menu_items" mi ON oi."menuItemId" = mi.id
          JOIN "categories" c ON mi."categoryId" = c.id
          JOIN "orders" o ON oi."orderId" = o.id
          WHERE o."createdAt" >= ${startDate}
            AND o.status != 'CANCELLED'
            AND o."locationId" = ${staffLocationId}
          GROUP BY c.id, c.name
          ORDER BY revenue DESC
          LIMIT 10
        `
      : Prisma.sql`
          SELECT
            c.name,
            COALESCE(SUM(oi.subtotal), 0) AS revenue,
            COUNT(DISTINCT o.id)::bigint AS orders
          FROM "order_items" oi
          JOIN "menu_items" mi ON oi."menuItemId" = mi.id
          JOIN "categories" c ON mi."categoryId" = c.id
          JOIN "orders" o ON oi."orderId" = o.id
          WHERE o."createdAt" >= ${startDate} AND o.status != 'CANCELLED'
          GROUP BY c.id, c.name
          ORDER BY revenue DESC
          LIMIT 10
        `
  );

  res.json({
    success: true,
    data: {
      dailyStats: dailyStats.map((d) => ({
        date: d.date,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })),
      orderTypeDistribution: orderTypeDistribution.map((d) => ({
        type: d.orderType,
        count: d._count,
      })),
      orderStatusDistribution: orderStatusDistribution.map((d) => ({
        status: d.status,
        count: d._count,
      })),
      hourlyDistribution: hourlyDistribution.map((d) => ({
        hour: d.hour,
        orders: Number(d.orders),
      })),
      categoryRevenue: categoryRevenue.map((d) => ({
        name: d.name,
        revenue: Number(d.revenue),
        orders: Number(d.orders),
      })),
    },
  });
}
