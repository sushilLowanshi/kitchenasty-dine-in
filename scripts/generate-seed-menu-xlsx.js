const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const rows = [
  {
    name: 'Bruschetta',
    slug: 'bruschetta',
    description:
      'Wood-fired sourdough topped with heirloom tomatoes, roasted garlic, fresh basil, and a drizzle of aged balsamic',
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
    description:
      'Crisp romaine hearts tossed in house-made Caesar dressing with garlic croutons, shaved Parmigiano-Reggiano, and anchovy breadcrumbs',
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
    description:
      'Classic, roasted red pepper, and herb-infused hummus served with warm pita bread and marinated olives',
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
    description:
      'Wild-caught salmon fillet glazed with saffron-lemon butter, served over herbed couscous with charred broccolini',
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
    description:
      'Spiced lamb kofta skewers grilled over charcoal, served with tzatziki, pickled onions, and saffron rice',
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
    description:
      'Slow-roasted shawarma chicken over turmeric rice with tahini sauce, pickled turnips, and a fresh herb salad',
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
    description:
      'San Marzano tomato sauce, buffalo mozzarella, fresh basil, and extra-virgin olive oil on our house-made dough',
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
    description:
      "Crispy flatbread brushed with olive oil and topped with za'atar, cherry tomatoes, labneh, and a squeeze of lemon",
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
    description:
      'Layers of espresso-soaked savoiardi and whipped mascarpone dusted with Valrhona cocoa',
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
    description:
      'Flaky phyllo pastry layered with pistachios and walnuts, soaked in rose-water honey syrup',
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
    description:
      'House-squeezed lemonade with fresh mint and a hint of orange blossom water',
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
    description:
      'Traditional slow-brewed Turkish coffee with cardamom, served with a piece of Turkish delight',
    price: 5.99,
    category: 'Beverages',
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&h=400&fit=crop',
    isActive: 'true',
    sortOrder: 2,
    trackStock: 'false',
    stockQty: 0,
  },
];

const outDir = path.join(__dirname, '..', 'downloads');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'kitchenasty-seed-menu-import.xlsx');

const sheet = XLSX.utils.json_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Menu Items');
XLSX.writeFile(book, outPath);
console.log('Wrote', outPath, 'rows=', rows.length);
