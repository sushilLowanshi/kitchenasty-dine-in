import { useEffect, useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';
import { getActiveOrderId, getActiveOrderIds } from '../lib/activeOrder.js';
import { apiUrl } from '../lib/apiBase.js';
import { storePaths } from '../lib/kioskPath.js';
import { orderStatusBadgeClass, orderStatusLabel } from './checkout/types.js';

interface ExistingOrderItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  optionsLabel: string;
  status: string;
}

export default function CartDrawer() {
  const { t } = useTranslation();
  const { items, isOpen, setIsOpen, updateQuantity, removeItem, clear, subtotal } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const paths = storePaths(location.pathname);
  const activeOrderId = getActiveOrderId();
  const [existingItems, setExistingItems] = useState<ExistingOrderItem[]>([]);
  const [existingSubtotal, setExistingSubtotal] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const orderIds = getActiveOrderIds();
    if (orderIds.length === 0) {
      setExistingItems([]);
      setExistingSubtotal(0);
      return;
    }

    let cancelled = false;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    Promise.all(
      orderIds.map((orderId) =>
        fetch(apiUrl(`/api/orders/${orderId}`), { headers })
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const lines: ExistingOrderItem[] = [];
      let subtotalSum = 0;
      for (const data of results) {
        if (!data?.success) continue;
        const order = data.data as Record<string, unknown>;
        if (['COMPLETED', 'CANCELLED'].includes(order.status as string)) continue;
        const status = (order.status as string) || 'PENDING';
        const orderItems = (order.items as Array<Record<string, unknown>>) || [];
        if (typeof order.subtotal === 'number') subtotalSum += order.subtotal;
        orderItems.forEach((item, index) => {
          const quantity = Number(item.quantity) || 0;
          const options = (item.options as Array<{ valueName?: string; value?: string }>) || [];
          lines.push({
            id: (item.id as string) || `existing-${order.id}-${index}`,
            name: (item.name as string) || 'Item',
            quantity,
            lineTotal:
              typeof item.subtotal === 'number'
                ? item.subtotal
                : (Number(item.unitPrice || item.price) || 0) * quantity,
            optionsLabel: options
              .map((o) => o.valueName || o.value || '')
              .filter(Boolean)
              .join(', '),
            status,
          });
        });
      }
      setExistingItems(lines);
      setExistingSubtotal(subtotalSum);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, token, activeOrderId]);

  function goBackToOrder() {
    clear();
    setIsOpen(false);
    navigate(paths.checkout);
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    },
    [setIsOpen]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setIsOpen(false)}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{t('cart.title')}</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label={t('cart.close')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              <p className="text-gray-500">{t('cart.empty')}</p>
              <button
                onClick={() => setIsOpen(false)}
                className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                {t('cart.browsMenu')}
              </button>
              {activeOrderId ? (
                <button
                  type="button"
                  onClick={goBackToOrder}
                  className="mt-3 w-full border-2 border-gray-300 text-gray-800 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back to your order
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-6">
              {existingItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    Previous order
                  </p>
                  <div className="space-y-3">
                    {existingItems.map((item) => (
                      <div key={item.id} className="flex gap-3 pb-3 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-800 text-base">{item.name}</h3>
                            <span
                              className={`text-xs uppercase font-semibold px-2 py-0.5 rounded ${orderStatusBadgeClass(item.status)}`}
                            >
                              {orderStatusLabel(item.status)}
                            </span>
                          </div>
                          {item.optionsLabel ? (
                            <p className="text-xs text-gray-400 mt-0.5">{item.optionsLabel}</p>
                          ) : null}
                          <p className="text-xs text-gray-400 mt-1">Qty {item.quantity}</p>
                        </div>
                        <div className="text-sm font-medium text-gray-500">${item.lineTotal.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                {existingItems.length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-3">
                    Adding now
                  </p>
                )}
                <div className="space-y-4">
                  {items.map((item) => {
                    const optionsTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
                    const lineTotal = (item.price + optionsTotal) * item.quantity;
                    return (
                      <div key={item.id} className="flex gap-3 pb-4 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                            {existingItems.length > 0 && (
                              <span className="text-[10px] uppercase font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                                New
                              </span>
                            )}
                          </div>
                          {item.options.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.options.map((o) => o.valueName).join(', ')}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50"
                            >
                              -
                            </button>
                            <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50"
                            >
                              +
                            </button>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="ml-2 text-xs text-red-500 hover:text-red-700"
                            >
                              {t('cart.remove')}
                            </button>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-gray-900">${lineTotal.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-4 space-y-3">
            {existingItems.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Previous order</span>
                <span className="font-medium text-gray-500">${existingSubtotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {existingItems.length > 0 ? 'New items' : t('cart.subtotal')}
              </span>
              <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
            </div>
            <Link
              to={paths.checkout}
              onClick={() => setIsOpen(false)}
              className="block text-center bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
            >
              {activeOrderId ? 'Add to Order' : t('cart.checkout')}
            </Link>
            {activeOrderId ? (
              <button
                type="button"
                onClick={goBackToOrder}
                className="block w-full text-center border-2 border-gray-300 text-gray-800 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Back to your order
              </button>
            ) : null}
            <button
              onClick={clear}
              className="block w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
