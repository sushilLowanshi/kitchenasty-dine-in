import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { storePaths } from '../../lib/kioskPath.js';
import type { CheckoutSummaryItem, SessionOrderRef } from './types.js';
import { orderStatusBadgeClass, orderStatusLabel } from './types.js';

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
  /** Each kitchen ticket in this dine-in session */
  sessionOrders?: SessionOrderRef[];
  cancellingOrderId?: string | null;
  onCancelOrder?: (orderId: string) => void;
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
  sessionOrders = [],
  cancellingOrderId,
  onCancelOrder,
}: CheckoutOrderSummaryProps) {
  const location = useLocation();
  const menuPath = storePaths(location.pathname).menu;
  const [selectedItem, setSelectedItem] = useState<CheckoutSummaryItem | null>(null);
  const selectedOrder = sessionOrders.find((order) => order.id === selectedItem?.orderId);
  const canCancel =
    !!selectedOrder && (selectedOrder.status === 'CONFIRMED' || selectedOrder.status === 'PENDING');
  const isCancelling = !!selectedOrder && cancellingOrderId === selectedOrder.id;

  useEffect(() => {
    if (!selectedItem?.orderId) return;
    const order = sessionOrders.find((entry) => entry.id === selectedItem.orderId);
    if (order?.status === 'CANCELLED') setSelectedItem(null);
  }, [sessionOrders, selectedItem?.orderId]);

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      {mode === 'add-items' && (
        <p className="text-xs text-gray-500 mb-3">Existing order items and new items from your cart.</p>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item) => {
          const canOpen = !!item.orderId;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!canOpen}
              onClick={() => canOpen && setSelectedItem(item)}
              className={`w-full flex justify-between text-left rounded-lg px-2 py-2 -mx-2 ${
                canOpen ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base text-gray-900 font-medium">{item.name}</span>
                  {item.status ? (
                    <span
                      className={`text-xs uppercase font-semibold px-2 py-0.5 rounded ${orderStatusBadgeClass(item.status)}`}
                    >
                      {orderStatusLabel(item.status)}
                    </span>
                  ) : null}
                  {item.isNew && (
                    <span className="text-xs uppercase font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                      New
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Qty {item.quantity}</p>
                {item.optionsLabel ? (
                  <p className="text-xs text-gray-400">{item.optionsLabel}</p>
                ) : null}
              </div>
              <span className="text-base text-gray-900 font-medium shrink-0">${item.lineTotal.toFixed(2)}</span>
            </button>
          );
        })}
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
          {/* Cancel buttons commented out — cancel from the item details popup.
          {showCancel && cancelTargets.map((order) => (
            <button key={order.id} type="button" onClick={() => onCancelOrder?.(order.id)}>
              Cancel Order
            </button>
          ))}
          */}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Link
            to={menuPath}
            className="block w-full text-center bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Browse Menu / Add Items
          </Link>
          {/*
          <Link to={menuPath}>Browse Menu</Link>
          <Link to={menuPath}>Add Items</Link>
          */}
          {/* Cancel buttons commented out — cancel from the item details popup.
          {showCancel && cancelTargets.map((order) => (
            <button key={order.id} type="button" onClick={() => onCancelOrder?.(order.id)}>
              Cancel Order
            </button>
          ))}
          */}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Item details</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-1">{selectedItem.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 text-sm mb-5">
              {selectedItem.status ? (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Status</span>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${orderStatusBadgeClass(selectedItem.status)}`}>
                    {orderStatusLabel(selectedItem.status)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Quantity</span>
                <span className="text-gray-900 font-medium">{selectedItem.quantity}</span>
              </div>
              {selectedItem.optionsLabel ? (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Options</span>
                  <span className="text-gray-900 text-right">{selectedItem.optionsLabel}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Price</span>
                <span className="text-gray-900 font-medium">${selectedItem.lineTotal.toFixed(2)}</span>
              </div>
              {selectedItem.orderNumber ? (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Order</span>
                  <span className="text-gray-900 font-medium">#{selectedItem.orderNumber}</span>
                </div>
              ) : null}
            </div>

            {selectedOrder && onCancelOrder ? (
              <button
                type="button"
                disabled={!canCancel || isCancelling}
                onClick={() => onCancelOrder(selectedOrder.id)}
                title={
                  canCancel
                    ? `Cancel order #${selectedOrder.orderNumber}`
                    : 'Cancel is only available while status is New or Confirmed'
                }
                className="w-full border-2 border-red-300 text-red-700 py-3 rounded-lg font-semibold hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                {isCancelling ? 'Cancelling…' : 'Cancel Order'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
