import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { apiUrl, API_ORIGIN } from '../lib/apiBase.js';
import { getActiveOrderId, setActiveOrderId, clearActiveOrderId } from '../lib/activeOrder.js';
import CheckoutOrderStatus from '../components/checkout/CheckoutOrderStatus.js';
import CheckoutOrderSummary from '../components/checkout/CheckoutOrderSummary.js';
import CheckoutPayment from '../components/checkout/CheckoutPayment.js';
import CheckoutOfflineModal from '../components/checkout/CheckoutOfflineModal.js';
import PaymentSuccessModal from '../components/checkout/PaymentSuccessModal.js';
import type { PlacedOrder, CheckoutSummaryItem } from '../components/checkout/types.js';

const PAYMENT_SUCCESS_TITLE = 'Your payment was successful!';
const PAYMENT_SUCCESS_MESSAGE = 'Thank you — please visit again.';

// type OrderType = 'delivery' | 'pickup';
// type PaymentMethod = 'cash' | 'stripe' | 'paypal';

const TAX_RATE = 0.08;

function mapApiOrder(data: Record<string, unknown>): PlacedOrder {
  const items = (data.items as PlacedOrder['items']) || [];
  return {
    id: data.id as string,
    orderNumber: data.orderNumber as string,
    status: (data.status as string) || 'PENDING',
    subtotal: data.subtotal as number,
    tax: data.tax as number,
    total: data.total as number,
    items,
  };
}

function cartItemsToPayload(items: ReturnType<typeof useCart>['items']) {
  return items.map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    comment: item.comment,
    options: item.options.map((o) => ({
      menuOptionValueId: o.valueId,
      name: o.optionName,
      value: o.valueName,
      priceModifier: o.priceModifier,
    })),
  }));
}

export default function Checkout() {
  const { t } = useTranslation();
  const { items, subtotal, clear } = useCart();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [comment, setComment] = useState('');
  // const [orderType, setOrderType] = useState<OrderType>('delivery');
  // const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
  // const [scheduledAt, setScheduledAt] = useState('');
  // const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // const [deliveryFee, setDeliveryFee] = useState(4.99);
  // const [zoneError, setZoneError] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');

  // const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  // const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);
  // const loyaltyDiscount = loyaltyRedeem / 100;

  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [loadingActiveOrder, setLoadingActiveOrder] = useState(() => !!getActiveOrderId());
  const [paying, setPaying] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [razorpayTestMode, setRazorpayTestMode] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const paymentHandledRef = useRef(false);
  const cancelHandledRef = useRef(false);

  useEffect(() => {
    paymentHandledRef.current = false;
    cancelHandledRef.current = false;
  }, [placedOrder?.id]);

  const completePaymentAndGoHome = useCallback(() => {
    if (paymentHandledRef.current) return;
    paymentHandledRef.current = true;
    clearActiveOrderId();
    setOfflineModalOpen(false);
    setQrImage(null);
    setPaymentId(null);
    setWaitingForPayment(false);
    setPaymentSuccessOpen(true);
    showToast({
      type: 'success',
      title: PAYMENT_SUCCESS_TITLE,
      message: PAYMENT_SUCCESS_MESSAGE,
      duration: 5000,
    });
    window.setTimeout(() => navigate('/'), 3200);
  }, [navigate, showToast]);

  // const tax = subtotal * TAX_RATE;
  // const total = subtotal + tax;
  // const currentDeliveryFee = orderType === 'delivery' ? deliveryFee : 0;
  // const total = subtotal + tax + currentDeliveryFee - loyaltyDiscount;

  useEffect(() => {
    fetch(apiUrl('/api/locations'))
      .then((res) => res.json())
      .then((data) => {
        const loc = data.data?.[0];
        if (loc?.isBusy) {
          setIsBusy(true);
          setBusyMessage(loc.busyMessage || 'This location is currently not accepting orders.');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const activeId = getActiveOrderId();
    if (!activeId) {
      setLoadingActiveOrder(false);
      return;
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(apiUrl(`/api/orders/${activeId}`), { headers })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          clearActiveOrderId();
          return;
        }
        const order = data.data as Record<string, unknown>;
        if (['COMPLETED', 'CANCELLED'].includes(order.status as string)) {
          clearActiveOrderId();
          return;
        }
        setPlacedOrder(mapApiOrder(order));
      })
      .catch(() => clearActiveOrderId())
      .finally(() => setLoadingActiveOrder(false));
  }, [token]);

  useEffect(() => {
    if (!placedOrder?.id) return;
    const socket = io(API_ORIGIN || undefined, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.emit('join:order', placedOrder.id);
    socket.on('order:statusUpdate', (data: { id: string; status: string }) => {
      if (data.id === placedOrder.id) {
        setPlacedOrder((prev) => (prev ? { ...prev, status: data.status } : prev));
        if (data.status === 'COMPLETED') {
          completePaymentAndGoHome();
        } else if (data.status === 'CANCELLED') {
          clearActiveOrderId();
          setOfflineModalOpen(false);
          setWaitingForPayment(false);
          setQrImage(null);
          if (!cancelHandledRef.current) {
            showToast({ type: 'info', title: 'Order cancelled' });
          }
          cancelHandledRef.current = false;
        }
      }
    });
    socket.on('payment:completed', (data: { orderId: string; status: string }) => {
      if (data.orderId === placedOrder.id && data.status === 'COMPLETED') {
        setPlacedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
        completePaymentAndGoHome();
      }
    });
    return () => {
      socket.emit('leave:order', placedOrder.id);
      socket.disconnect();
    };
  }, [placedOrder?.id, completePaymentAndGoHome, showToast]);

  // Poll Razorpay payment status while waiting (demo auto-complete + live webhook backup)
  useEffect(() => {
    if (!paymentId || !waitingForPayment) return;

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/payments/razorpay/status/${paymentId}`), { headers });
        const data = await res.json();
        if (data.success && data.data?.status === 'COMPLETED') {
          setPlacedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
          completePaymentAndGoHome();
        }
      } catch {
        // ignore transient poll errors
      }
    };

    poll();
    const interval = window.setInterval(poll, 2000);
    return () => window.clearInterval(interval);
  }, [paymentId, waitingForPayment, token, completePaymentAndGoHome]);

  // useEffect(() => { fetch loyalty ... }, [token]);

  const hasPendingCart = items.length > 0;
  const checkoutMode = placedOrder
    ? hasPendingCart
      ? 'add-items'
      : 'placed'
    : 'pre-order';

  if (loadingActiveOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-gray-600">Loading your order…</p>
      </div>
    );
  }

  if (!hasPendingCart && !placedOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('checkout.emptyCart')}</h1>
        <Link
          to="/menu"
          className="inline-block bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          {t('checkout.browseMenu')}
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const orderItems = cartItemsToPayload(items);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (placedOrder && hasPendingCart) {
        const res = await fetch(apiUrl(`/api/orders/${placedOrder.id}/items`), {
          method: 'POST',
          headers,
          body: JSON.stringify({ items: orderItems }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add items to order');

        clear();
        setPlacedOrder(mapApiOrder(data.data as Record<string, unknown>));
        showToast({ type: 'success', title: 'New items added to your order' });
        setQrImage(null);
        setPaymentId(null);
        setWaitingForPayment(false);
        return;
      }

      const body: Record<string, unknown> = {
        orderType: 'DINE_IN',
        items: orderItems,
        comment: comment || undefined,
      };

      if (!user) {
        body.guestName = guestName;
        body.guestEmail = guestEmail;
        body.guestPhone = guestPhone || undefined;
      }

      const res = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');

      clear();
      const created = mapApiOrder(data.data as Record<string, unknown>);
      setActiveOrderId(created.id);
      setPlacedOrder(created);
      showToast({ type: 'success', title: 'Order placed successfully!' });
      setQrImage(null);
      setPaymentId(null);
      setWaitingForPayment(false);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePayOnline() {
    if (!placedOrder) return;
    setPaying(true);
    setError('');
    setOfflineModalOpen(false);
    setWaitingForPayment(false);
    setQrImage(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      // UPI QR only (Razorpay QR / payment-link)
      const res = await fetch(apiUrl('/api/payments/razorpay/create-qr'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: placedOrder.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create Razorpay QR');

      const image = data.data.qrImageDataUrl || data.data.qrImageUrl || null;
      if (!image) throw new Error('QR image was not generated');

      setQrImage(image);
      setPaymentId(data.data.paymentId);
      setRazorpayTestMode(!!data.data.testMode);
      setWaitingForPayment(true);
      showToast({
        type: 'info',
        title: 'Scan UPI QR to pay',
        message: data.data.message || 'Use PhonePe / GPay / any UPI app.',
      });
    } catch (err: any) {
      setError(err.message);
      setWaitingForPayment(false);
      setRazorpayTestMode(false);
      showToast({ type: 'error', title: 'Payment failed', message: err.message });
    } finally {
      setPaying(false);
    }
  }

  async function handleSimulateTestPay() {
    if (!placedOrder || !paymentId) return;
    setPaying(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/payments/razorpay/simulate-test-pay'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: placedOrder.id, paymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test simulate failed');
      showToast({ type: 'info', title: 'Test payment sent', message: 'Waiting for confirmation…' });
    } catch (err: any) {
      setError(err.message);
      showToast({ type: 'error', title: 'Test pay failed', message: err.message });
    } finally {
      setPaying(false);
    }
  }

  async function handlePayOffline() {
    if (!placedOrder) return;
    setPaying(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/payments/offline-request'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: placedOrder.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to notify staff');
      setOfflineModalOpen(true);
    } catch (err: any) {
      setError(err.message);
      showToast({ type: 'error', title: 'Could not notify staff', message: err.message });
    } finally {
      setPaying(false);
    }
  }

  async function handleCancelOrder() {
    if (!placedOrder) return;
    if (placedOrder.status !== 'CONFIRMED' && placedOrder.status !== 'PENDING') return;
    setCancelling(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl(`/api/orders/${placedOrder.id}/cancel`), {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      cancelHandledRef.current = true;
      setPlacedOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
      clearActiveOrderId();
      setOfflineModalOpen(false);
      showToast({ type: 'info', title: 'Order cancelled' });
      setQrImage(null);
      setWaitingForPayment(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const existingSummaryItems: CheckoutSummaryItem[] = placedOrder
    ? placedOrder.items.map((item) => ({
        id: item.id || `existing-${item.name}-${item.quantity}`,
        name: item.name,
        quantity: item.quantity,
        lineTotal: item.subtotal ?? ((item.unitPrice || item.price || 0) * item.quantity),
        optionsLabel: (item.options || [])
          .map((o) => o.valueName || o.value || '')
          .filter(Boolean)
          .join(', '),
      }))
    : [];

  const newSummaryItems: CheckoutSummaryItem[] = items.map((item) => {
    const optionsTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotal: (item.price + optionsTotal) * item.quantity,
      optionsLabel: item.options.map((o) => o.valueName).join(', '),
      isNew: !!placedOrder,
    };
  });

  const summaryItems: CheckoutSummaryItem[] =
    checkoutMode === 'add-items'
      ? [...existingSummaryItems, ...newSummaryItems]
      : placedOrder
        ? existingSummaryItems
        : newSummaryItems;

  const cartSubtotal = subtotal;
  const cartTax = cartSubtotal * TAX_RATE;
  const summarySubtotal = placedOrder
    ? placedOrder.subtotal + (hasPendingCart ? cartSubtotal : 0)
    : cartSubtotal;
  const summaryTax = placedOrder
    ? placedOrder.tax + (hasPendingCart ? cartTax : 0)
    : cartTax;
  const summaryTotal = summarySubtotal + summaryTax;

  const canPay =
    !!placedOrder &&
    !hasPendingCart &&
    placedOrder.status !== 'COMPLETED' &&
    placedOrder.status !== 'CANCELLED';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('checkout.title')}</h1>

      {isBusy && checkoutMode === 'pre-order' && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 p-4 rounded-lg mb-6">
          <p className="font-semibold">Currently Unavailable</p>
          <p className="text-sm mt-1">{busyMessage}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm mb-6">{error}</div>
      )}

      <CheckoutOfflineModal
        open={offlineModalOpen}
        paying={paying}
        onPayOnline={handlePayOnline}
        onClose={() => setOfflineModalOpen(false)}
      />

      <PaymentSuccessModal open={paymentSuccessOpen} />

      {placedOrder && (
        <CheckoutOrderStatus orderNumber={placedOrder.orderNumber} status={placedOrder.status} />
      )}

      <form onSubmit={handleSubmit}>
        {checkoutMode === 'pre-order' ? (
          <div className="max-w-2xl mx-auto w-full space-y-6">
            {!user && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
                <p className="text-sm text-gray-600 mb-3">
                  <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium underline">
                    {t('nav.login')}
                  </Link>{' '}
                  for faster checkout, or continue as guest:
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Full name *"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email address *"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
                  />
                  <input
                    type="tel"
                    placeholder="Phone number (optional)"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
                  />
                </div>
              </div>
            )}
            <CheckoutOrderSummary
              title={t('checkout.orderSummary')}
              items={summaryItems}
              subtotal={summarySubtotal}
              tax={summaryTax}
              total={summaryTotal}
              subtotalLabel={t('checkout.subtotal')}
              taxLabel={t('checkout.tax')}
              totalLabel={t('checkout.total')}
              mode="pre-order"
              placeOrderDisabled={loading || isBusy}
              placeOrderLabel={
                isBusy
                  ? 'Currently Unavailable'
                  : loading
                    ? t('checkout.processing')
                    : `${t('checkout.placeOrder')} — $${summaryTotal.toFixed(2)}`
              }
            />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-6">
              {placedOrder && checkoutMode === 'placed' && (
                <CheckoutOrderSummary
                  title={t('checkout.orderSummary')}
                  items={summaryItems}
                  subtotal={summarySubtotal}
                  tax={summaryTax}
                  total={summaryTotal}
                  subtotalLabel={t('checkout.subtotal')}
                  taxLabel={t('checkout.tax')}
                  totalLabel={t('checkout.total')}
                  mode="placed"
                  orderStatus={placedOrder.status}
                  cancelling={cancelling}
                  onCancelOrder={handleCancelOrder}
                />
              )}
            </div>

            <div className="lg:w-96 shrink-0">
              {checkoutMode === 'add-items' ? (
                <CheckoutOrderSummary
                  title="Add to your order"
                  items={summaryItems}
                  subtotal={summarySubtotal}
                  tax={summaryTax}
                  total={summaryTotal}
                  subtotalLabel={t('checkout.subtotal')}
                  taxLabel={t('checkout.tax')}
                  totalLabel={t('checkout.total')}
                  mode="add-items"
                  placeOrderDisabled={loading || isBusy}
                  placeOrderLabel={
                    loading
                      ? t('checkout.processing')
                      : `Add to Order — $${cartSubtotal.toFixed(2)} new`
                  }
                  onBackToOrder={() => {
                    clear();
                  }}
                />
              ) : canPay ? (
                <CheckoutPayment
                  paying={paying}
                  qrImage={qrImage}
                  waitingForPayment={waitingForPayment}
                  testMode={razorpayTestMode}
                  onPayOnline={handlePayOnline}
                  onPayOffline={handlePayOffline}
                  onSimulateTestPay={handleSimulateTestPay}
                />
              ) : null}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
