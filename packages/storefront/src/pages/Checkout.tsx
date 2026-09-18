import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { useKiosk } from '../context/KioskContext.js';
import { apiUrl, API_ORIGIN } from '../lib/apiBase.js';
import { kioskIdFromPath, storePaths } from '../lib/kioskPath.js';
import { getActiveOrderIds, setActiveOrderId, setActiveOrderIds, addActiveOrderId, removeActiveOrderId, clearActiveOrderId } from '../lib/activeOrder.js';
// Order status tracker is shown on each item instead of a single checkout banner.
// import CheckoutOrderStatus from '../components/checkout/CheckoutOrderStatus.js';
import CheckoutOrderSummary from '../components/checkout/CheckoutOrderSummary.js';
import CheckoutPayment from '../components/checkout/CheckoutPayment.js';
import CheckoutOfflineModal from '../components/checkout/CheckoutOfflineModal.js';
import PaymentSuccessModal from '../components/checkout/PaymentSuccessModal.js';
import type { PlacedOrder, CheckoutSummaryItem } from '../components/checkout/types.js';

const PAYMENT_SUCCESS_TITLE = 'Your payment was successful!';
const PAYMENT_SUCCESS_MESSAGE = 'Thank you — please visit again.';

// type OrderType = 'delivery' | 'pickup';
// type PaymentMethod = 'cash' | 'stripe' | 'paypal';

interface PayTicket {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  image: string;
  testMode: boolean;
}

function isOpenStatus(status: string) {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

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
    guestName: data.guestName as string | undefined,
    guestEmail: data.guestEmail as string | undefined,
    guestPhone: data.guestPhone as string | undefined,
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
  const { tableName } = useKiosk();
  const navigate = useNavigate();
  const location = useLocation();
  const paths = storePaths(location.pathname);
  const kioskId = kioskIdFromPath(location.pathname);
  const { showToast } = useToast();

  const [comment, setComment] = useState('');
  // const [orderType, setOrderType] = useState<OrderType>('delivery');
  // const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
  // const [scheduledAt, setScheduledAt] = useState('');
  // const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Contact Information UI commented out — auto guest for table dine-in
  // const [guestName, setGuestName] = useState('');
  // const [guestEmail, setGuestEmail] = useState('');
  // const [guestPhone, setGuestPhone] = useState('');
  const guestName = tableName ? `Guest (${tableName})` : 'Guest';
  const guestEmail = 'guest@dinein.local';
  const guestPhone = '';

  // const [deliveryFee, setDeliveryFee] = useState(4.99);
  // const [zoneError, setZoneError] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');

  // const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  // const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);
  // const loyaltyDiscount = loyaltyRedeem / 100;

  const [placedOrders, setPlacedOrders] = useState<PlacedOrder[]>([]);
  const [loadingActiveOrder, setLoadingActiveOrder] = useState(() => getActiveOrderIds().length > 0);
  const [paying, setPaying] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [paidOrderIds, setPaidOrderIds] = useState<string[]>([]);
  const [payTickets, setPayTickets] = useState<PayTicket[]>([]);
  const [payIndex, setPayIndex] = useState(0);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const paymentHandledRef = useRef(false);
  const cancelHandledRef = useRef(false);
  const placedOrdersRef = useRef(placedOrders);
  placedOrdersRef.current = placedOrders;

  const activeTicket = payTickets[payIndex] ?? null;
  const qrImage = activeTicket?.image ?? null;
  const paymentId = activeTicket?.paymentId ?? null;
  const razorpayTestMode = activeTicket?.testMode ?? false;

  useEffect(() => {
    paymentHandledRef.current = false;
    cancelHandledRef.current = false;
  }, [placedOrders.map((order) => order.id).join(',')]);

  const completePaymentAndGoHome = useCallback(() => {
    if (paymentHandledRef.current) return;
    paymentHandledRef.current = true;
    clearActiveOrderId();
    if (kioskId) clear();
    setOfflineModalOpen(false);
    setPayTickets([]);
    setPayIndex(0);
    setWaitingForPayment(false);
    setPaymentSuccessOpen(true);
    showToast({
      type: 'success',
      title: PAYMENT_SUCCESS_TITLE,
      message: PAYMENT_SUCCESS_MESSAGE,
      duration: 5000,
    });
    window.setTimeout(() => navigate(paths.home), 3200);
  }, [navigate, showToast, kioskId, clear, paths.home]);

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
    const ids = getActiveOrderIds();
    if (ids.length === 0) {
      setLoadingActiveOrder(false);
      return;
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    Promise.all(
      ids.map((id) =>
        fetch(apiUrl(`/api/orders/${id}`), { headers })
          .then((res) => res.json())
          .then((data) => (data.success ? mapApiOrder(data.data as Record<string, unknown>) : null))
          .catch(() => null)
      )
    )
      .then((loaded) => {
        const orders = loaded.filter((order): order is PlacedOrder => !!order && isOpenStatus(order.status));
        if (orders.length === 0) {
          clearActiveOrderId();
          setPlacedOrders([]);
          return;
        }
        setActiveOrderIds(orders.map((order) => order.id));
        setPlacedOrders(orders);
      })
      .finally(() => setLoadingActiveOrder(false));
  }, [token]);

  const sessionKey = placedOrders.map((order) => order.id).join(',');

  const markOrderPaid = useCallback(
    (orderId: string) => {
      setPaidOrderIds((prev) => {
        const nextPaid = prev.includes(orderId) ? prev : [...prev, orderId];
        const unpaid = placedOrdersRef.current.filter(
          (order) => isOpenStatus(order.status) && !nextPaid.includes(order.id)
        );
        if (unpaid.length === 0) {
          completePaymentAndGoHome();
        }
        return nextPaid;
      });
      setPayIndex((index) => {
        if (payTickets[index]?.orderId !== orderId) return index;
        return Math.min(index + 1, payTickets.length);
      });
    },
    [completePaymentAndGoHome, payTickets]
  );

  useEffect(() => {
    if (!sessionKey) return;
    const ids = sessionKey.split(',');
    const socket = io(API_ORIGIN || undefined, { path: '/socket.io', transports: ['websocket', 'polling'] });
    ids.forEach((id) => socket.emit('join:order', id));

    socket.on('order:statusUpdate', (data: { id: string; status: string; orderNumber?: string }) => {
      if (!ids.includes(data.id)) return;

      if (data.status === 'CANCELLED') {
        setWaitingForPayment(false);
        setPayTickets([]);
        // Toast only for remote/staff cancel — customer cancel toasts in handleCancelOrder
        if (!cancelHandledRef.current) {
          cancelHandledRef.current = true;
          showToast({
            type: 'info',
            title: data.orderNumber
              ? `Order #${data.orderNumber} cancelled successfully`
              : 'Order cancelled successfully',
          });
          window.setTimeout(() => {
            cancelHandledRef.current = false;
          }, 4000);
        }
      }

      setPlacedOrders((prev) => {
        const next = prev.map((order) => (order.id === data.id ? { ...order, status: data.status } : order));
        const stillOpen = next.filter((order) => isOpenStatus(order.status));
        setActiveOrderIds(stillOpen.map((order) => order.id));
        if (data.status !== 'CANCELLED' && stillOpen.length === 0 && next.some((order) => order.status === 'COMPLETED')) {
          completePaymentAndGoHome();
        }
        return next;
      });
    });

    socket.on('payment:completed', (data: { orderId: string; status: string }) => {
      if (ids.includes(data.orderId) && data.status === 'COMPLETED') {
        markOrderPaid(data.orderId);
      }
    });

    return () => {
      ids.forEach((id) => socket.emit('leave:order', id));
      socket.disconnect();
    };
  }, [sessionKey, completePaymentAndGoHome, showToast, markOrderPaid]);

  // Poll Razorpay payment status while waiting (demo auto-complete + live webhook backup)
  useEffect(() => {
    if (!paymentId || !waitingForPayment) return;

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/payments/razorpay/status/${paymentId}`), { headers });
        const data = await res.json();
        if (data.success && data.data?.status === 'COMPLETED' && activeTicket) {
          markOrderPaid(activeTicket.orderId);
        }
      } catch {
        // ignore transient poll errors
      }
    };

    poll();
    const interval = window.setInterval(poll, 2000);
    return () => window.clearInterval(interval);
  }, [paymentId, waitingForPayment, token, activeTicket, markOrderPaid]);

  // useEffect(() => { fetch loyalty ... }, [token]);

  const hasPendingCart = items.length > 0;
  const openOrders = placedOrders.filter((order) => isOpenStatus(order.status));
  const checkoutMode = placedOrders.length > 0
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

  if (!hasPendingCart && placedOrders.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('checkout.emptyCart')}</h1>
        <Link
          to={paths.menu}
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

      if (openOrders.length > 0 && hasPendingCart) {
        const source = openOrders[0];
        const body: Record<string, unknown> = {
          orderType: 'DINE_IN',
          items: orderItems,
        };
        if (kioskId) body.kioskId = kioskId;
        if (!user) {
          body.guestName = guestName || source.guestName;
          body.guestEmail = guestEmail || source.guestEmail;
          body.guestPhone = guestPhone || source.guestPhone || undefined;
        }

        const res = await fetch(apiUrl('/api/orders'), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add items to order');

        const created = mapApiOrder(data.data as Record<string, unknown>);
        clear();
        addActiveOrderId(created.id);
        setPlacedOrders((prev) => [...prev, created]);
        showToast({ type: 'success', title: 'New items added to your order' });
        setPayTickets([]);
        setPayIndex(0);
        setWaitingForPayment(false);
        return;
      }

      const body: Record<string, unknown> = {
        orderType: 'DINE_IN',
        items: orderItems,
        comment: comment || undefined,
      };
      if (kioskId) body.kioskId = kioskId;

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
      setPlacedOrders([created]);
      showToast({ type: 'success', title: 'Order placed successfully!' });
      setPayTickets([]);
      setPayIndex(0);
      setWaitingForPayment(false);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePayOnline() {
    const targets = openOrders.filter((order) => !paidOrderIds.includes(order.id));
    if (targets.length === 0) return;
    setPaying(true);
    setError('');
    setOfflineModalOpen(false);
    setWaitingForPayment(false);
    setPayTickets([]);
    setPayIndex(0);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const tickets: PayTicket[] = [];
      for (const order of targets) {
        const res = await fetch(apiUrl('/api/payments/razorpay/create-qr'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ orderId: order.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to create QR for #${order.orderNumber}`);
        const image = data.data.qrImageDataUrl || data.data.qrImageUrl || null;
        if (!image) throw new Error(`QR image was not generated for #${order.orderNumber}`);
        tickets.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: data.data.paymentId,
          image,
          testMode: !!data.data.testMode,
        });
      }

      setPayTickets(tickets);
      setPayIndex(0);
      setWaitingForPayment(true);
      showToast({
        type: 'info',
        title: tickets.length > 1 ? `Scan QR for #${tickets[0].orderNumber}` : 'Scan UPI QR to pay',
        message: tickets.length > 1
          ? `Each order is paid separately. ${tickets.length} QR codes.`
          : 'Use PhonePe / GPay / any UPI app.',
      });
    } catch (err: any) {
      setError(err.message);
      setWaitingForPayment(false);
      setPayTickets([]);
      showToast({ type: 'error', title: 'Payment failed', message: err.message });
    } finally {
      setPaying(false);
    }
  }

  async function handleSimulateTestPay() {
    if (!activeTicket) return;
    setPaying(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/payments/razorpay/simulate-test-pay'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: activeTicket.orderId, paymentId: activeTicket.paymentId }),
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
    const targets = openOrders.filter((order) => !paidOrderIds.includes(order.id));
    if (targets.length === 0) return;
    setPaying(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      for (const order of targets) {
        const res = await fetch(apiUrl('/api/payments/offline-request'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ orderId: order.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to notify staff for #${order.orderNumber}`);
      }
      setOfflineModalOpen(true);
    } catch (err: any) {
      setError(err.message);
      showToast({ type: 'error', title: 'Could not notify staff', message: err.message });
    } finally {
      setPaying(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    const target = placedOrders.find((order) => order.id === orderId);
    if (!target) return;
    if (target.status !== 'CONFIRMED' && target.status !== 'PENDING') return;
    // Mark before fetch so socket cancel event cannot show a second toast
    cancelHandledRef.current = true;
    setCancellingOrderId(orderId);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel`), {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      setPlacedOrders((prev) => {
        const next = prev.map((order) => (order.id === orderId ? { ...order, status: 'CANCELLED' } : order));
        setActiveOrderIds(next.filter((order) => isOpenStatus(order.status)).map((order) => order.id));
        return next;
      });
      removeActiveOrderId(orderId);
      setPayTickets((tickets) => tickets.filter((ticket) => ticket.orderId !== orderId));
      showToast({ type: 'info', title: `Order #${target.orderNumber} cancelled successfully` });
      window.setTimeout(() => {
        cancelHandledRef.current = false;
      }, 4000);
    } catch (err: any) {
      cancelHandledRef.current = false;
      setError(err.message);
    } finally {
      setCancellingOrderId(null);
    }
  }

  const sessionOrders = placedOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
  }));

  const existingSummaryItems: CheckoutSummaryItem[] = placedOrders.flatMap((order) =>
    order.items.map((item) => ({
      id: item.id || `${order.id}-${item.name}-${item.quantity}`,
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.subtotal ?? ((item.unitPrice || item.price || 0) * item.quantity),
      optionsLabel: (item.options || [])
        .map((o) => o.valueName || o.value || '')
        .filter(Boolean)
        .join(', '),
      status: order.status,
      orderId: order.id,
      orderNumber: order.orderNumber,
    }))
  );

  const newSummaryItems: CheckoutSummaryItem[] = items.map((item) => {
    const optionsTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotal: (item.price + optionsTotal) * item.quantity,
      optionsLabel: item.options.map((o) => o.valueName).join(', '),
      isNew: openOrders.length > 0,
    };
  });

  const summaryItems: CheckoutSummaryItem[] =
    checkoutMode === 'add-items'
      ? [...existingSummaryItems, ...newSummaryItems]
      : openOrders.length > 0 || placedOrders.length > 0
        ? existingSummaryItems
        : newSummaryItems;

  const billableOrders = placedOrders.filter((order) => order.status !== 'CANCELLED');
  const cartSubtotal = subtotal;
  const cartTax = cartSubtotal * TAX_RATE;
  const placedSubtotal = billableOrders.reduce((sum, order) => sum + order.subtotal, 0);
  const placedTax = billableOrders.reduce((sum, order) => sum + order.tax, 0);
  const summarySubtotal = placedOrders.length > 0
    ? placedSubtotal + (hasPendingCart ? cartSubtotal : 0)
    : cartSubtotal;
  const summaryTax = placedOrders.length > 0
    ? placedTax + (hasPendingCart ? cartTax : 0)
    : cartTax;
  const summaryTotal = summarySubtotal + summaryTax;

  const canPay = openOrders.some((order) => !paidOrderIds.includes(order.id)) && !hasPendingCart;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* Order status tracker commented out — each item shows its own order status.
      {placedOrders[0] && (
        <CheckoutOrderStatus orderNumber={placedOrders[0].orderNumber} status={placedOrders[0].status} />
      )}
      */}

      <form onSubmit={handleSubmit}>
        {checkoutMode === 'pre-order' ? (
          <div className="w-full space-y-6">
            {/* Contact Information commented out — customer login/guest form not needed for dine-in table orders
            {!user && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
                <p className="text-sm text-gray-600 mb-3">Continue as guest:</p>
                <div className="space-y-3">
                  <input type="text" required placeholder="Full name *" value={guestName} ... />
                  <input type="email" required placeholder="Email address *" value={guestEmail} ... />
                  <input type="tel" placeholder="Phone number (optional)" value={guestPhone} ... />
                </div>
              </div>
            )}
            */}
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
          <div className="w-full space-y-6">
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
                sessionOrders={sessionOrders}
                cancellingOrderId={cancellingOrderId}
                onCancelOrder={handleCancelOrder}
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
            ) : null}
            {placedOrders.length > 0 && checkoutMode === 'placed' && (
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
                sessionOrders={sessionOrders}
                cancellingOrderId={cancellingOrderId}
                onCancelOrder={handleCancelOrder}
              />
            )}
            {canPay ? (
              <CheckoutPayment
                paying={paying}
                qrImage={qrImage}
                waitingForPayment={waitingForPayment}
                testMode={razorpayTestMode}
                caption={
                  payTickets.length > 1 && activeTicket
                    ? `QR ${Math.min(payIndex + 1, payTickets.length)} of ${payTickets.length} · #${activeTicket.orderNumber}`
                    : undefined
                }
                onPayOnline={handlePayOnline}
                onPayOffline={handlePayOffline}
                onSimulateTestPay={handleSimulateTestPay}
              />
            ) : null}
          </div>
        )}
      </form>
    </div>
  );
}
