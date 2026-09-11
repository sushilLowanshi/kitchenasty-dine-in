import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiUrl, API_ORIGIN } from '../lib/apiBase.js';
import { io } from 'socket.io-client';
import PaymentSuccessModal from '../components/checkout/PaymentSuccessModal.js';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  options: { name: string; value: string; priceModifier: number }[];
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  tip: number;
  total: number;
  items: OrderItem[];
}

export default function Bill() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [offlineMsg, setOfflineMsg] = useState('');
  const paymentHandledRef = useRef(false);

  const onPaymentSuccess = useCallback(() => {
    if (paymentHandledRef.current) return;
    paymentHandledRef.current = true;
    setWaitingForPayment(false);
    setQrImage(null);
    setPaymentSuccessOpen(true);
    window.setTimeout(() => navigate('/'), 3200);
  }, [navigate]);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(apiUrl(`/api/orders/${id}`), { headers })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load bill');
        return res.json();
      })
      .then((data) => setOrder(data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  useEffect(() => {
    if (!order?.id) return;
    const socket = io(API_ORIGIN || undefined, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.emit('join:order', order.id);
    socket.on('payment:completed', (data: { orderId: string; status: string }) => {
      if (data.orderId === order.id && data.status === 'COMPLETED') onPaymentSuccess();
    });
    socket.on('order:statusUpdate', (data: { id: string; status: string }) => {
      if (data.id === order.id && data.status === 'COMPLETED') onPaymentSuccess();
    });
    return () => {
      socket.emit('leave:order', order.id);
      socket.disconnect();
    };
  }, [order?.id, onPaymentSuccess]);

  useEffect(() => {
    if (!paymentId || !waitingForPayment) return;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/payments/razorpay/status/${paymentId}`), { headers });
        const data = await res.json();
        if (data.success && data.data?.status === 'COMPLETED') onPaymentSuccess();
      } catch {
        // ignore
      }
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => window.clearInterval(interval);
  }, [paymentId, waitingForPayment, token, onPaymentSuccess]);

  async function startQrPayment() {
    if (!order) return;
    setPaying(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/payments/razorpay/create-qr'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create QR');
      const image = data.data.qrImageDataUrl || data.data.qrImageUrl || null;
      if (!image) throw new Error('QR image was not generated');
      setQrImage(image);
      setPaymentId(data.data.paymentId);
      setWaitingForPayment(true);
    } catch (err: any) {
      setError(err.message);
      setWaitingForPayment(false);
    } finally {
      setPaying(false);
    }
  }

  async function requestOffline() {
    if (!order) return;
    setPaying(true);
    setError('');
    setOfflineMsg('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/payments/offline-request'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to notify staff');
      setOfflineMsg(data.data.message || 'Staff notified. Waiting for confirmation…');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="max-w-lg mx-auto py-16 text-center text-gray-500">Loading bill…</div>;
  }

  if (error && !order) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Link to="/menu" className="text-primary-600 underline">Back to menu</Link>
      </div>
    );
  }

  if (!order) return null;

  if (order.status === 'COMPLETED' && !paymentSuccessOpen) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment complete</h1>
        <p className="text-gray-600 mb-6">Order #{order.orderNumber} is completed.</p>
        <Link to={`/orders/${order.id}`} className="text-primary-600 font-medium underline">
          View order
        </Link>
      </div>
    );
  }

  const canPay = order.status === 'SERVED' || order.status === 'READY';

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <PaymentSuccessModal open={paymentSuccessOpen} />

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bill / Checkout</h1>
      <p className="text-sm text-gray-500 mb-6">Order #{order.orderNumber}</p>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {offlineMsg && <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm mb-4">{offlineMsg}</div>}

      {!canPay && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm text-gray-600 mb-4">
          Bill opens when your order is <strong>Ready</strong> or <strong>Served</strong>. Current status: {order.status}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <span className="text-gray-400 mr-1">{item.quantity}x</span>
                <span className="text-gray-800">{item.name}</span>
              </div>
              <span className="font-medium">${item.subtotal.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Tax</span><span>${order.tax.toFixed(2)}</span></div>
          {order.discount > 0 && (
            <div className="flex justify-between text-green-600"><span>Discount</span><span>-${order.discount.toFixed(2)}</span></div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-100">
            <span>Total</span>
            <span className="text-primary-600">${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {canPay && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={paying || waitingForPayment}
            onClick={startQrPayment}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {waitingForPayment ? 'Waiting for payment…' : 'Pay with QR (Razorpay)'}
          </button>

          {qrImage && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 text-center space-y-3">
              <p className="text-sm font-medium text-gray-800">Scan Razorpay QR to pay</p>
              <img
                src={qrImage}
                alt="Razorpay payment QR code"
                className="mx-auto w-48 h-48 rounded-lg border border-gray-100 bg-white"
              />
              {waitingForPayment && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <span className="inline-block w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  Waiting for payment confirmation…
                </div>
              )}
              <p className="text-xs text-gray-500">
                {/* Demo mode: payment confirms automatically after a few seconds. */}
                Payment succeeds only after a real UPI scan (or Razorpay test simulate).
              </p>
              {/* <button
                type="button"
                disabled={paying}
                onClick={confirmDemoQr}
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Confirm Payment Success
              </button> */}
            </div>
          )}

          <button
            type="button"
            disabled={paying || waitingForPayment}
            onClick={requestOffline}
            className="w-full border-2 border-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            Offline Payment (notify staff)
          </button>
        </div>
      )}

      <Link to={`/orders/${order.id}`} className="block text-center mt-6 text-sm text-primary-600 underline">
        Back to order status
      </Link>
    </div>
  );
}
