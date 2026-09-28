import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rows = [
  {
    name: 'Margherita Pizza',
    slug: 'margherita-pizza',
    description: 'Classic tomato, mozzarella, basil',
    price: 12.99,
    category: 'Pizzas',
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d264?w=400',
    isActive: 'true',
    sortOrder: 1,
    trackStock: 'false',
    stockQty: 0,
  },
  {
    name: 'Garlic Bread',
    slug: '',
    description: 'Toasted with garlic butter',
    price: 4.5,
    category: 'Starters',
    image: 'https://images.unsplash.com/photo-1573140401552-3fab0b24607d?w=400',
    isActive: 'true',
    sortOrder: 2,
    trackStock: 'false',
    stockQty: 0,
  },
  {
    name: 'Coca Cola',
    slug: 'coca-cola',
    description: '330ml can',
    price: 2.5,
    category: 'Drinks',
    image: '',
    isActive: 'true',
    sortOrder: 3,
    trackStock: 'true',
    stockQty: 50,
  },
];

const sheet = XLSX.utils.json_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Menu Items');

const outDir = path.resolve(__dirname, '../../admin/public');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'menu-items-import-template.xlsx');
XLSX.writeFile(book, out);
console.log('Wrote', out);
