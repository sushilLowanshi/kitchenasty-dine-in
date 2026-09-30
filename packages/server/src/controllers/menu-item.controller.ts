import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { auditLog } from '../lib/audit.js';
import { assertLocationAccess, getStaffLocationId } from '../lib/locationScope.js';

const menuOptionValueSchema = z.object({
  name: z.string().min(1),
  priceModifier: z.number().default(0),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

const menuOptionSchema = z.object({
  name: z.string().min(1),
  displayType: z.enum(['SELECT', 'RADIO', 'CHECKBOX', 'QUANTITY']).default('SELECT'),
  isRequired: z.boolean().default(false),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  sortOrder: z.number().int().min(0).default(0),
  values: z.array(menuOptionValueSchema).min(1),
});

const createMenuItemSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  price: z.number().min(0),
  image: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  trackStock: z.boolean().default(false),
  stockQty: z.number().int().min(0).default(0),
  orderType: z.enum(['DELIVERY', 'PICKUP']).nullable().optional(),
  categoryId: z.string().min(1),
  locationId: z.string().optional(),
  options: z.array(menuOptionSchema).optional(),
  allergenIds: z.array(z.string()).optional(),
  mealtimeIds: z.array(z.string()).optional(),
});

const updateMenuItemSchema = createMenuItemSchema.partial().omit({ slug: true });

export async function listMenuItems(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  const categoryId = req.query.categoryId as string | undefined;
  const search = req.query.search as string | undefined;

  const where: Record<string, unknown> = {};
  if (categoryId) where.categoryId = categoryId;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const staffLocationId = await getStaffLocationId(req);
  const isStaff = req.user?.type === 'staff';
  const isSuperAdmin = isStaff && req.user?.role === 'SUPER_ADMIN';

  if (staffLocationId) {
    // Manager / staff: only their restaurant
    where.locationId = staffLocationId;
  } else if (isStaff && !isSuperAdmin) {
    // Manager with no location assigned — never leak other restaurants' menus
    res.json({
      success: true,
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
    return;
  } else if (typeof req.query.locationId === 'string' && req.query.locationId) {
    where.locationId = req.query.locationId;
  } else if (!isSuperAdmin) {
    // Public / unscoped must not receive every restaurant's items
    res.status(400).json({
      success: false,
      error: 'locationId query parameter is required',
    });
    return;
  }
  // Super admin without locationId: all items (admin overview)

  const [items, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { options: true, allergens: true, mealtimes: true } },
      },
    }),
    prisma.menuItem.count({ where }),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getMenuItem(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      options: {
        orderBy: { sortOrder: 'asc' },
        include: {
          values: { orderBy: { sortOrder: 'asc' } },
        },
      },
      allergens: { include: { allergen: true } },
      mealtimes: { include: { mealtime: true } },
    },
  });

  if (!item) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  if (item.locationId) {
    const scopeError = await assertLocationAccess(req, item.locationId);
    if (req.user?.type === 'staff' && scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  res.json({ success: true, data: item });
}

export async function createMenuItem(req: Request, res: Response): Promise<void> {
  const parsed = createMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const { options, allergenIds, mealtimeIds, ...data } = parsed.data;

  const staffLocationId = await getStaffLocationId(req);
  const isStaff = req.user?.type === 'staff';
  const isSuperAdmin = isStaff && req.user?.role === 'SUPER_ADMIN';

  if (staffLocationId) {
    data.locationId = staffLocationId;
  } else if (isStaff && !isSuperAdmin) {
    res.status(403).json({
      success: false,
      error: 'No restaurant assigned to your account. Contact an admin before adding menu items.',
    });
    return;
  } else if (data.locationId) {
    const scopeError = await assertLocationAccess(req, data.locationId);
    if (scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  const existing = await prisma.menuItem.findUnique({ where: { slug: data.slug } });
  if (existing) {
    res.status(409).json({ success: false, error: 'A menu item with this slug already exists' });
    return;
  }

  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) {
    res.status(400).json({ success: false, error: 'Category not found' });
    return;
  }
  if (staffLocationId && category.locationId && category.locationId !== staffLocationId) {
    res.status(403).json({ success: false, error: 'Category belongs to another location' });
    return;
  }
  // Inherit restaurant from category when not set (keeps item scoped to that restaurant)
  if (!data.locationId && category.locationId) {
    data.locationId = category.locationId;
  }

  const item = await prisma.menuItem.create({
    data: {
      ...data,
      options: options ? {
        create: options.map((opt) => ({
          name: opt.name,
          displayType: opt.displayType,
          isRequired: opt.isRequired,
          minSelect: opt.minSelect,
          maxSelect: opt.maxSelect,
          sortOrder: opt.sortOrder,
          values: {
            create: opt.values,
          },
        })),
      } : undefined,
      allergens: allergenIds?.length ? {
        create: allergenIds.map((allergenId) => ({ allergenId })),
      } : undefined,
      mealtimes: mealtimeIds?.length ? {
        create: mealtimeIds.map((mealtimeId) => ({ mealtimeId })),
      } : undefined,
    },
    include: {
      category: { select: { id: true, name: true } },
      options: { include: { values: true } },
      allergens: { include: { allergen: true } },
      mealtimes: { include: { mealtime: true } },
    },
  });

  auditLog(req, { action: 'create', entity: 'MenuItem', entityId: item.id, details: { name: item.name } });

  res.status(201).json({ success: true, data: item });
}

export async function updateMenuItem(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = updateMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors });
    return;
  }

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  if (existing.locationId) {
    const scopeError = await assertLocationAccess(req, existing.locationId);
    if (scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  const { options, allergenIds, mealtimeIds, ...data } = parsed.data;

  const staffLocationId = await getStaffLocationId(req);
  if (staffLocationId) {
    // Managers cannot move items to another restaurant
    delete data.locationId;
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...data,
      options: options ? {
        deleteMany: {},
        create: options.map((opt) => ({
          name: opt.name,
          displayType: opt.displayType,
          isRequired: opt.isRequired,
          minSelect: opt.minSelect,
          maxSelect: opt.maxSelect,
          sortOrder: opt.sortOrder,
          values: {
            create: opt.values,
          },
        })),
      } : undefined,
      allergens: allergenIds !== undefined ? {
        deleteMany: {},
        create: allergenIds.map((allergenId) => ({ allergenId })),
      } : undefined,
      mealtimes: mealtimeIds !== undefined ? {
        deleteMany: {},
        create: mealtimeIds.map((mealtimeId) => ({ mealtimeId })),
      } : undefined,
    },
    include: {
      category: { select: { id: true, name: true } },
      options: { include: { values: true } },
      allergens: { include: { allergen: true } },
      mealtimes: { include: { mealtime: true } },
    },
  });

  auditLog(req, { action: 'update', entity: 'MenuItem', entityId: id, details: data });

  res.json({ success: true, data: item });
}

export async function deleteMenuItem(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  if (existing.locationId) {
    const scopeError = await assertLocationAccess(req, existing.locationId);
    if (scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  const orderItemCount = await prisma.orderItem.count({ where: { menuItemId: id } });
  if (orderItemCount > 0) {
    res.status(409).json({
      success: false,
      error: 'Cannot delete menu item with existing orders. Deactivate it instead.',
    });
    return;
  }

  await prisma.menuItem.delete({ where: { id } });
  auditLog(req, { action: 'delete', entity: 'MenuItem', entityId: id, details: { name: existing.name } });
  res.json({ success: true, message: 'Menu item deleted' });
}

/**
 * Delete all menu items for the manager's restaurant.
 * Items referenced by orders are deactivated instead of hard-deleted.
 */
export async function deleteAllMenuItems(req: Request, res: Response): Promise<void> {
  const staffLocationId = await getStaffLocationId(req);
  if (!staffLocationId) {
    res.status(403).json({
      success: false,
      error: 'Only location managers can delete all items for their restaurant',
    });
    return;
  }

  const items = await prisma.menuItem.findMany({
    where: { locationId: staffLocationId },
    select: { id: true, name: true },
  });

  let deleted = 0;
  let deactivated = 0;

  for (const item of items) {
    const orderItemCount = await prisma.orderItem.count({ where: { menuItemId: item.id } });
    if (orderItemCount > 0) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { isActive: false },
      });
      deactivated += 1;
    } else {
      await prisma.menuItem.delete({ where: { id: item.id } });
      deleted += 1;
    }
  }

  auditLog(req, {
    action: 'delete',
    entity: 'MenuItem',
    entityId: staffLocationId,
    details: { deleteAll: true, deleted, deactivated },
  });

  res.json({
    success: true,
    data: { deleted, deactivated, total: items.length },
    message:
      deactivated > 0
        ? `Deleted ${deleted} item(s). ${deactivated} item(s) with order history were deactivated.`
        : `Deleted ${deleted} item(s).`,
  });
}

export async function uploadMenuItemImage(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  if (existing.locationId) {
    const scopeError = await assertLocationAccess(req, existing.locationId);
    if (scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No image file provided' });
    return;
  }

  const imagePath = `/uploads/${req.file.filename}`;

  const item = await prisma.menuItem.update({
    where: { id },
    data: { image: imagePath },
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  res.json({ success: true, data: item });
}

export async function deleteMenuItemImage(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  if (existing.locationId) {
    const scopeError = await assertLocationAccess(req, existing.locationId);
    if (scopeError) {
      res.status(403).json({ success: false, error: scopeError });
      return;
    }
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: { image: null },
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  res.json({ success: true, data: item });
}

function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'item';
}

function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.toLowerCase().trim() === key.toLowerCase());
    if (found != null && row[found] != null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
}

function cellNum(row: Record<string, unknown>, ...keys: string[]): number | null {
  const raw = cellStr(row, ...keys);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function cellBool(row: Record<string, unknown>, defaultValue: boolean, ...keys: string[]): boolean {
  const raw = cellStr(row, ...keys).toLowerCase();
  if (!raw) return defaultValue;
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return defaultValue;
}

async function uniqueMenuSlug(base: string): Promise<string> {
  let slug = base;
  let i = 0;
  while (await prisma.menuItem.findUnique({ where: { slug }, select: { id: true } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base;
  let i = 0;
  while (await prisma.category.findUnique({ where: { slug }, select: { id: true } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

/** Sample Excel for managers — seed.ts menu data (name, category, price, image URL, etc.) */
export async function downloadMenuImportTemplate(_req: Request, res: Response): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = [
    {
      name: 'Bruschetta',
      slug: 'bruschetta',
      description: 'Wood-fired sourdough topped with heirloom tomatoes, roasted garlic, fresh basil, and a drizzle of aged balsamic',
      price: 8.99,
      category: 'Mezze & Starters',
      image: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 1,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Caesar Salad',
      slug: 'caesar-salad',
      description: 'Crisp romaine hearts tossed in house-made Caesar dressing with garlic croutons, shaved Parmigiano-Reggiano, and anchovy breadcrumbs',
      price: 10.99,
      category: 'Mezze & Starters',
      image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 2,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Hummus Trio',
      slug: 'hummus-trio',
      description: 'Classic, roasted red pepper, and herb-infused hummus served with warm pita bread and marinated olives',
      price: 12.99,
      category: 'Mezze & Starters',
      image: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 3,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Grilled Salmon',
      slug: 'grilled-salmon',
      description: 'Wild-caught salmon fillet glazed with saffron-lemon butter, served over herbed couscous with charred broccolini',
      price: 22.99,
      category: 'Mains',
      image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 1,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Lamb Kofta',
      slug: 'lamb-kofta',
      description: 'Spiced lamb kofta skewers grilled over charcoal, served with tzatziki, pickled onions, and saffron rice',
      price: 19.99,
      category: 'Mains',
      image: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 2,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Chicken Shawarma Bowl',
      slug: 'chicken-shawarma-bowl',
      description: 'Slow-roasted shawarma chicken over turmeric rice with tahini sauce, pickled turnips, and a fresh herb salad',
      price: 17.99,
      category: 'Mains',
      image: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 3,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Margherita Pizza',
      slug: 'margherita-pizza',
      description: 'San Marzano tomato sauce, buffalo mozzarella, fresh basil, and extra-virgin olive oil on our house-made dough',
      price: 14.99,
      category: 'Flatbreads & Pizza',
      image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 1,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: "Za'atar Flatbread",
      slug: 'zaatar-flatbread',
      description: "Crispy flatbread brushed with olive oil and topped with za'atar, cherry tomatoes, labneh, and a squeeze of lemon",
      price: 13.99,
      category: 'Flatbreads & Pizza',
      image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 2,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Tiramisu',
      slug: 'tiramisu',
      description: 'Layers of espresso-soaked savoiardi and whipped mascarpone dusted with Valrhona cocoa',
      price: 9.99,
      category: 'Sweets',
      image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 1,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Baklava',
      slug: 'baklava',
      description: 'Flaky phyllo pastry layered with pistachios and walnuts, soaked in rose-water honey syrup',
      price: 8.99,
      category: 'Sweets',
      image: 'https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 2,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Fresh Lemonade',
      slug: 'fresh-lemonade',
      description: 'House-squeezed lemonade with fresh mint and a hint of orange blossom water',
      price: 4.99,
      category: 'Beverages',
      image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 1,
      trackStock: 'false',
      stockQty: 0,
    },
    {
      name: 'Turkish Coffee',
      slug: 'turkish-coffee',
      description: 'Traditional slow-brewed Turkish coffee with cardamom, served with a piece of Turkish delight',
      price: 5.99,
      category: 'Beverages',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&h=400&fit=crop',
      isActive: 'true',
      sortOrder: 2,
      trackStock: 'false',
      stockQty: 0,
    },
  ];

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Menu Items');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="kitchenasty-seed-menu-import.xlsx"');
  res.send(buffer);
}

/**
 * Import menu items from Excel (.xlsx). Manager only (own location).
 * Columns: name*, price*, category*, slug?, description?, image?, isActive?, sortOrder?, trackStock?, stockQty?
 */
export async function importMenuItems(req: Request, res: Response): Promise<void> {
  const staffLocationId = await getStaffLocationId(req);
  if (!staffLocationId) {
    res.status(403).json({
      success: false,
      error: 'Only location managers can import menu items for their restaurant',
    });
    return;
  }

  if (!req.file?.buffer) {
    res.status(400).json({ success: false, error: 'Excel file is required (.xlsx)' });
    return;
  }

  const XLSX = await import('xlsx');
  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch {
    res.status(400).json({ success: false, error: 'Could not read Excel file. Use .xlsx format.' });
    return;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    res.status(400).json({ success: false, error: 'Excel file has no sheets' });
    return;
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });

  if (rows.length === 0) {
    res.status(400).json({ success: false, error: 'Excel sheet is empty' });
    return;
  }

  const categoryCache = new Map<string, string>();
  const existingCats = await prisma.category.findMany({
    where: { locationId: staffLocationId },
    select: { id: true, name: true },
  });
  for (const c of existingCats) {
    categoryCache.set(c.name.toLowerCase(), c.id);
  }

  const created: { id: string; name: string }[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const name = cellStr(row, 'name', 'item name', 'item');
    const price = cellNum(row, 'price');
    const categoryName = cellStr(row, 'category', 'category name');

    if (!name) {
      errors.push({ row: rowNum, error: 'name is required' });
      continue;
    }
    if (price == null || price < 0) {
      errors.push({ row: rowNum, error: 'valid price is required' });
      continue;
    }
    if (!categoryName) {
      errors.push({ row: rowNum, error: 'category is required' });
      continue;
    }

    try {
      let categoryId = categoryCache.get(categoryName.toLowerCase());
      if (!categoryId) {
        const catSlug = await uniqueCategorySlug(slugify(categoryName));
        const cat = await prisma.category.create({
          data: {
            name: categoryName,
            slug: catSlug,
            locationId: staffLocationId,
            isActive: true,
          },
        });
        categoryId = cat.id;
        categoryCache.set(categoryName.toLowerCase(), categoryId);
      }

      const rawSlug = cellStr(row, 'slug');
      const baseSlug = slugify(rawSlug || name);
      const slug = await uniqueMenuSlug(baseSlug);

      const description = cellStr(row, 'description', 'desc') || undefined;
      const image = cellStr(row, 'image', 'imageurl', 'image_url', 'image url') || undefined;
      const isActive = cellBool(row, true, 'isactive', 'is_active', 'active');
      const sortOrder = cellNum(row, 'sortorder', 'sort_order', 'sort') ?? 0;
      const trackStock = cellBool(row, false, 'trackstock', 'track_stock');
      const stockQty = cellNum(row, 'stockqty', 'stock_qty', 'stock') ?? 0;

      const item = await prisma.menuItem.create({
        data: {
          name,
          slug,
          description,
          price,
          image,
          isActive,
          sortOrder: Math.max(0, Math.floor(sortOrder)),
          trackStock,
          stockQty: Math.max(0, Math.floor(stockQty)),
          categoryId,
          locationId: staffLocationId,
        },
      });

      created.push({ id: item.id, name: item.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: rowNum, error: message });
    }
  }

  auditLog(req, {
    action: 'create',
    entity: 'MenuItem',
    entityId: staffLocationId,
    details: { import: true, created: created.length, errors: errors.length },
  });

  res.status(created.length > 0 ? 201 : 400).json({
    success: created.length > 0,
    data: {
      created: created.length,
      failed: errors.length,
      items: created,
      errors,
    },
    error: created.length === 0 ? 'No items were imported' : undefined,
  });
}
