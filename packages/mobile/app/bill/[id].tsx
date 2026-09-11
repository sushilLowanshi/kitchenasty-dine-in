import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Image, Modal, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { orderApi, paymentApi } from '@/api/endpoints';
import { useOrderSocket } from '@/hooks/useOrderSocket';
import type { Order } from '@/api/types';
import { formatCurrency } from '@/lib/formatters';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorView from '@/components/ui/ErrorView';
import Button from '@/components/ui/Button';

const PAYMENT_SUCCESS_TITLE = 'Your payment was successful!';
const PAYMENT_SUCCESS_MESSAGE = 'Thank you — please visit again.';

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [offlineMsg, setOfflineMsg] = useState('');
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const paymentHandledRef = useRef(false);

  const onPaymentSuccess = useCallback(() => {
    if (paymentHandledRef.current) return;
    paymentHandledRef.current = true;
    setWaitingForPayment(false);
    setQrImage(null);
    setPaymentId(null);
    setPaymentSuccessOpen(true);
    setTimeout(() => router.replace('/(tabs)'), 3200);
  }, [router]);

  useEffect(() => {
    if (!id) return;
    orderApi
      .getById(id)
      .then((res) => setOrder(res.data!))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const onStatusUpdate = useCallback(
    (data: { id: string; status: string }) => {
      setOrder((prev) => (prev ? { ...prev, status: data.status } : prev));
      if (data.status === 'COMPLETED') onPaymentSuccess();
    },
    [onPaymentSuccess],
  );

  const onPaymentCompleted = useCallback(
    (data: { orderId: string; status: string }) => {
      if (data.status === 'COMPLETED') {
        setOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
        onPaymentSuccess();
      }
    },
    [onPaymentSuccess],
  );

  useOrderSocket(id, onStatusUpdate, onPaymentCompleted);

  // Poll Razorpay status while waiting (same as web)
  useEffect(() => {
    if (!paymentId || !waitingForPayment) return;

    const poll = async () => {
      try {
        const res = await paymentApi.getRazorpayStatus(paymentId);
        if (res.data?.status === 'COMPLETED') onPaymentSuccess();
      } catch {
        // ignore transient poll errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [paymentId, waitingForPayment, onPaymentSuccess]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (error && !order) return <ErrorView message={error} />;
  if (!order) return null;

  // Same as web Checkout: pay anytime after place (not only Ready/Served)
  // const canPay = order.status === 'SERVED' || order.status === 'READY';
  const canPay = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

  async function startQr() {
    setPaying(true);
    setError('');
    setWaitingForPayment(false);
    setQrImage(null);
    try {
      const res = await paymentApi.createRazorpayQr(order!.id);
      const image = res.data!.qrImageDataUrl || res.data!.qrImageUrl || null;
      if (!image) throw new Error('QR image was not generated');
      setQrImage(image);
      setPaymentId(res.data!.paymentId);
      setTestMode(!!res.data!.testMode);
      setWaitingForPayment(true);
    } catch (err: any) {
      setError(err.message);
      setWaitingForPayment(false);
      setTestMode(false);
    } finally {
      setPaying(false);
    }
  }

  async function simulateTestPay() {
    if (!paymentId) return;
    setPaying(true);
    setError('');
    try {
      await paymentApi.simulateTestPay(order!.id, paymentId);
      onPaymentSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  async function offline() {
    setPaying(true);
    setError('');
    try {
      const res = await paymentApi.requestOffline(order!.id);
      setOfflineMsg(res.data?.message || 'Staff notified. Waiting for confirmation…');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  if (order.status === 'COMPLETED' && !paymentSuccessOpen) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center p-6">
        <Text className="text-xl font-bold text-gray-900 mb-2">Payment complete</Text>
        <Text className="text-gray-600 mb-4">Order #{order.orderNumber}</Text>
        <Button title="View order" onPress={() => router.replace(`/orders/${order.id}`)} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Modal visible={paymentSuccessOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center p-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-900 mb-2 text-center">
              {PAYMENT_SUCCESS_TITLE}
            </Text>
            <Text className="text-gray-600 text-center">{PAYMENT_SUCCESS_MESSAGE}</Text>
          </View>
        </View>
      </Modal>

      <Text className="text-2xl font-bold text-gray-900 mb-1">Bill / Checkout</Text>
      <Text className="text-sm text-gray-500 mb-4">#{order.orderNumber}</Text>

      {error ? (
        <View className="bg-red-50 p-3 rounded-lg mb-3">
          <Text className="text-red-700 text-sm">{error}</Text>
        </View>
      ) : null}
      {offlineMsg ? (
        <View className="bg-amber-50 p-3 rounded-lg mb-3">
          <Text className="text-amber-800 text-sm">{offlineMsg}</Text>
        </View>
      ) : null}

      {!canPay && (
        <View className="bg-gray-100 p-3 rounded-lg mb-4">
          <Text className="text-sm text-gray-600">
            Payment is not available for this order. Current: {order.status}
          </Text>
        </View>
      )}

      <View className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        {order.items.map((item) => (
          <View key={item.id} className="flex-row justify-between py-2">
            <Text className="text-sm text-gray-800 flex-1">
              {item.quantity}x {item.name}
            </Text>
            <Text className="text-sm font-medium">{formatCurrency(item.subtotal)}</Text>
          </View>
        ))}
        <View className="border-t border-gray-100 mt-2 pt-2">
          <View className="flex-row justify-between py-1">
            <Text className="text-sm text-gray-600">Subtotal</Text>
            <Text className="text-sm">{formatCurrency(order.subtotal)}</Text>
          </View>
          <View className="flex-row justify-between py-1">
            <Text className="text-sm text-gray-600">Tax</Text>
            <Text className="text-sm">{formatCurrency(order.tax)}</Text>
          </View>
          <View className="flex-row justify-between py-1 mt-1">
            <Text className="text-base font-bold">Total</Text>
            <Text className="text-base font-bold text-primary-600">{formatCurrency(order.total)}</Text>
          </View>
        </View>
      </View>

      {canPay && (
        <View className="gap-3 mb-4">
          <Button
            title={
              paying
                ? 'Creating QR…'
                : waitingForPayment
                  ? 'Waiting for UPI payment…'
                  : 'Pay Online (UPI QR)'
            }
            onPress={startQr}
            loading={paying && !waitingForPayment}
            disabled={paying || waitingForPayment}
          />

          {qrImage ? (
            <View className="bg-white border border-gray-200 rounded-xl p-4 items-center">
              <Text className="text-sm font-semibold text-gray-900 mb-3">Scan Razorpay UPI QR</Text>
              <Image
                source={{ uri: qrImage }}
                style={{ width: 208, height: 208, borderRadius: 8 }}
                resizeMode="contain"
              />
              {waitingForPayment ? (
                <View className="flex-row items-center gap-2 mt-3 mb-2">
                  <ActivityIndicator size="small" color="#ea580c" />
                  <Text className="text-sm text-gray-600">Waiting for payment…</Text>
                </View>
              ) : null}
              <Text className="text-xs text-gray-500 text-center mt-2">
                Open PhonePe / GPay / any UPI app and scan this QR. No card checkout.
              </Text>
              {testMode ? (
                <View className="w-full mt-3">
                  {/* <Button
                    title="Simulate test payment (test keys only)"
                    variant="outline"
                    onPress={simulateTestPay}
                    loading={paying}
                    disabled={paying || !waitingForPayment}
                  /> */}
                </View>
              ) : null}
              {/* <Button title="Confirm Payment Success" onPress={confirmQr} /> */}
            </View>
          ) : null}

          <Button
            title="Pay Offline"
            variant="outline"
            onPress={offline}
            loading={paying}
            disabled={paying || waitingForPayment}
          />
        </View>
      )}

      <Button title="Back to order" variant="outline" onPress={() => router.back()} />
    </ScrollView>
  );
}
