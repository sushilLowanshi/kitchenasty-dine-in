export interface CheckoutSummaryItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  optionsLabel?: string;
  /** New items not yet added to the server order */
  isNew?: boolean;
  /** Kitchen status of the order this line belongs to */
  status?: string;
  orderId?: string;
  orderNumber?: string;
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
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
}

export interface SessionOrderRef {
  id: string;
  orderNumber: string;
  status: string;
}

export function orderStatusLabel(status: string): string {
  if (status === 'CANCELLED') return 'Cancelled';
  return CHECKOUT_STATUS_STEPS.find((step) => step.key === status)?.label ?? status;
}

export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'text-amber-700 bg-amber-50';
    case 'CONFIRMED':
      return 'text-blue-700 bg-blue-50';
    case 'PREPARING':
      return 'text-purple-700 bg-purple-50';
    case 'READY':
      return 'text-green-700 bg-green-50';
    case 'SERVED':
      return 'text-teal-700 bg-teal-50';
    case 'COMPLETED':
      return 'text-green-800 bg-green-100';
    case 'CANCELLED':
      return 'text-red-700 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-100';
  }
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
