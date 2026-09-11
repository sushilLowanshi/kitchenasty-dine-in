export interface CheckoutSummaryItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  optionsLabel?: string;
  /** New items not yet added to the server order */
  isNew?: boolean;
}

export interface PlacedOrderItem {
  id?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  subtotal: number;
  price?: number;
  options?: { name?: string; value?: string; valueName?: string; priceModifier?: number }[];
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  items: PlacedOrderItem[];
}

/** Dine-in tracker — starts at New (PENDING); staff moves to Confirmed */
export const CHECKOUT_STATUS_STEPS = [
  // /** Dine-in tracker — Placed (PENDING) commented out; starts at Confirmed */
  // { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PENDING', label: 'New' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
  { key: 'COMPLETED', label: 'Completed' },
];
