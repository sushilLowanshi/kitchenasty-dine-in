import { Link } from 'react-router-dom';
import type { CheckoutSummaryItem } from './types.js';

interface CheckoutOrderSummaryProps {
  title: string;
  items: CheckoutSummaryItem[];
  subtotal: number;
  tax: number;
  total: number;
  subtotalLabel: string;
  taxLabel: string;
  totalLabel: string;
  /** After place order: show browse + cancel; add-items: merge new cart lines */
  mode: 'pre-order' | 'placed' | 'add-items';
  placeOrderLabel?: string;
  placeOrderDisabled?: boolean;
  onPlaceOrder?: () => void;
  onBackToOrder?: () => void;
  orderStatus?: string;
  cancelling?: boolean;
  onCancelOrder?: () => void;
}

export default function CheckoutOrderSummary({
  title,
  items,
  subtotal,
  tax,
  total,
  subtotalLabel,
  taxLabel,
  totalLabel,
  mode,
  placeOrderLabel,
  placeOrderDisabled,
  onPlaceOrder,
  onBackToOrder,
  orderStatus,
  cancelling,
  onCancelOrder,
}: CheckoutOrderSummaryProps) {
  const canCancel = orderStatus === 'CONFIRMED' || orderStatus === 'PENDING';
  const showCancel = mode === 'placed' && orderStatus !== 'CANCELLED' && orderStatus !== 'COMPLETED';
  const cancelDisabled = !canCancel || !!cancelling;
  const isSticky = mode === 'pre-order' || mode === 'add-items';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${isSticky ? 'sticky top-24' : ''}`}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      {mode === 'add-items' && (
        <p className="text-xs text-gray-500 mb-3">Existing order items and new items from your cart.</p>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <div>
              <span className="text-gray-400 mr-1">{item.quantity}x</span>
              <span className="text-gray-700">{item.name}</span>
              {item.isNew && (
                <span className="ml-2 text-[10px] uppercase font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                  New
                </span>
              )}
              {item.optionsLabel ? (
                <p className="text-xs text-gray-400 ml-5">{item.optionsLabel}</p>
              ) : null}
            </div>
            <span className="text-gray-900 font-medium">${item.lineTotal.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">{subtotalLabel}</span>
          <span className="text-gray-900">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">{taxLabel}</span>
          <span className="text-gray-900">${tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-base">
          <span>{totalLabel}</span>
          <span className="text-primary-600">${total.toFixed(2)}</span>
        </div>
      </div>

      {mode === 'pre-order' || mode === 'add-items' ? (
        <div className="mt-4 space-y-2">
          <button
            type="submit"
            disabled={placeOrderDisabled}
            onClick={onPlaceOrder}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {placeOrderLabel}
          </button>
          {mode === 'add-items' && onBackToOrder && (
            <button
              type="button"
              onClick={onBackToOrder}
              className="w-full border-2 border-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Back to your order
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Link
            to="/menu"
            className="block w-full text-center bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Browse Menu / Add Items
          </Link>
          {/*
          <Link to="/menu">Browse Menu</Link>
          <Link to="/menu">Add Items</Link>
          */}
          {showCancel && (
            <button
              type="button"
              disabled={cancelDisabled}
              onClick={onCancelOrder}
              title={
                canCancel
                  ? 'Cancel this order'
                  : 'Cancel is only available while status is Confirmed'
              }
              className="w-full border-2 border-red-300 text-red-700 py-3 rounded-lg font-semibold hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
