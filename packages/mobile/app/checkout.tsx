import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Image, Modal, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { orderApi, loyaltyApi, locationApi, paymentApi } from '@/api/endpoints';
import type { Order } from '@/api/types';
import { formatCurrency } from '@/lib/formatters';
import { TAX_RATE, DEFAULT_DELIVERY_FEE } from '@/lib/constants';
import { getActiveOrderId, setActiveOrderId, clearActiveOrderId } from '@/lib/activeOrder';
import { useOrderSocket } from '@/hooks/useOrderSocket';
import Button from '@/components/ui/Button';
import TextInput from '@/components/ui/TextInput';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// type OrderType = 'delivery' | 'pickup';
// type PaymentMethod = 'cash' | 'stripe';

const PAYMENT_SUCCESS_TITLE = 'Your payment was successful!';
const PAYMENT_SUCCESS_MESSAGE = 'Thank you — please visit again.';
const STATUS_STEPS = [
  { key: 'PENDING', label: 'New' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
  { key: 'COMPLETED', label: 'Completed' },
];

function cartItemsToPayload(items: ReturnType<typeof useCartStore.getState>['items']) {
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

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const clearCart = useCartStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  // const [orderType, setOrderType] = useState<OrderType>('delivery');
  // const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
  // const [comment, setComment] = useState('');
  // const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  // const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);
  // const loyaltyDiscount = loyaltyRedeem / 100;

  const [isBusy, setIsBusy] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [loadingActiveOrder, setLoadingActiveOrder] = useState(true);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [razorpayTestMode, setRazorpayTestMode] = useState(false);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const paymentHandledRef = useRef(false);
  const cancelHandledRef = useRef(false);

  // DINE-IN active totals:
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  // Original:
  // const deliveryFee = orderType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;
  // const total = subtotal + tax + deliveryFee - loyaltyDiscount;
  // const deliveryFee = orderType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;

  void loyaltyApi;
  void DEFAULT_DELIVERY_FEE;
  void token;

  const orderIsOpen =
    !!placedOrder && placedOrder.status !== 'COMPLETED' && placedOrder.status !== 'CANCELLED';
  const hasPendingCart = items.length > 0;
  const checkoutMode = orderIsOpen ? (hasPendingCart ? 'add-items' : 'placed') : 'pre-order';

  const completePaymentAndGoHome = useCallback(() => {
    if (paymentHandledRef.current) return;
    paymentHandledRef.current = true;
    clearActiveOrderId();
    setOfflineModalOpen(false);
    setQrImage(null);
    setPaymentId(null);
    setWaitingForPayment(false);
    setPaymentSuccessOpen(true);
    setTimeout(() => router.replace('/(tabs)'), 3200);
  }, [router]);

  useEffect(() => {
    paymentHandledRef.current = false;
    cancelHandledRef.current = false;
  }, [placedOrder?.id]);

  useEffect(() => {
    locationApi
      .getAll()
      .then((res) => {
        const loc = res.data?.[0];
        if (loc?.isBusy) setIsBusy(true);
      })
      .catch(() => {});
  }, []);

  const loadActiveOrder = useCallback(async () => {
    const activeId = await getActiveOrderId();
    if (!activeId) {
      setPlacedOrder(null);
      setLoadingActiveOrder(false);
      return;
    }

    try {
      const res = await orderApi.getById(activeId);
      const order = res.data;
      if (!order || order.status === 'COMPLETED' || order.status === 'CANCELLED') {
        await clearActiveOrderId();
        setPlacedOrder(null);
        return;
      }
      setPlacedOrder(order);
    } catch {
      await clearActiveOrderId();
      setPlacedOrder(null);
    } finally {
      setLoadingActiveOrder(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActiveOrder();
    }, [loadActiveOrder]),
  );

  const onStatusUpdate = useCallback(
    (data: { id: string; status: string }) => {
      setPlacedOrder((prev) => (prev && prev.id === data.id ? { ...prev, status: data.status } : prev));
      if (data.status === 'COMPLETED') {
        completePaymentAndGoHome();
      } else if (data.status === 'CANCELLED') {
        clearActiveOrderId();
        setOfflineModalOpen(false);
        setWaitingForPayment(false);
        setQrImage(null);
        if (!cancelHandledRef.current) {
          Alert.alert('Order cancelled');
        }
        cancelHandledRef.current = false;
      }
    },
    [completePaymentAndGoHome],
  );

  const onPaymentCompleted = useCallback(
    (data: { orderId: string; status: string }) => {
      if (data.status === 'COMPLETED') {
        setPlacedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
        completePaymentAndGoHome();
      }
    },
    [completePaymentAndGoHome],
  );

  useOrderSocket(placedOrder?.id, onStatusUpdate, onPaymentCompleted);

  useEffect(() => {
    if (!paymentId || !waitingForPayment) return;

    const poll = async () => {
      try {
        const res = await paymentApi.getRazorpayStatus(paymentId);
        if (res.data?.status === 'COMPLETED') {
          setPlacedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
          completePaymentAndGoHome();
        }
      } catch {
        // ignore transient poll errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [paymentId, waitingForPayment, completePaymentAndGoHome]);

  // Original loyalty fetch (commented):
  // useEffect(() => {
  //   if (token) {
  //     loyaltyApi
  //       .getBalance()
  //       .then((res) => {
  //         if (res.data) setLoyaltyBalance(res.data.points);
  //       })
  //       .catch(() => {});
  //   }
  // }, [token]);

  if (loadingActiveOrder && !placedOrder) {
    return <LoadingSpinner fullScreen />;
  }

  if (!hasPendingCart && !placedOrder) {
    return (
      <EmptyState
        title={t('checkout.emptyCart')}
        actionLabel={t('checkout.browseMenu')}
        onAction={() => router.replace('/(tabs)/menu')}
      />
    );
  }

  async function handlePlaceOrder() {
    setError('');
    setLoading(true);

    try {
      const orderItems = cartItemsToPayload(items);

      if (orderIsOpen && hasPendingCart && placedOrder) {
        const res = await orderApi.addItems(placedOrder.id, orderItems);
        clearCart();
        setPlacedOrder(res.data!);
        setQrImage(null);
        setPaymentId(null);
        setWaitingForPayment(false);
        Alert.alert('New items added to your order');
        return;
      }

      // Original body (commented):
      // const body: Record<string, unknown> = {
      //   orderType: orderType.toUpperCase(),
      //   paymentMethod,
      //   items: orderItems,
      //   comment: comment || undefined,
      //   couponCode: couponCode || undefined,
      // };
      // if (orderType === 'delivery') {
      //   body.address = address;
      // }
      // if (loyaltyRedeem > 0) {
      //   body.loyaltyPointsRedeem = loyaltyRedeem;
      // }

      const body: Record<string, unknown> = {
        orderType: 'DINE_IN',
        items: orderItems,
        // comment: comment || undefined,
      };

      if (!user) {
        body.guestName = guestName;
        body.guestEmail = guestEmail;
        body.guestPhone = guestPhone || undefined;
      }

      const res = await orderApi.place(body);
      clearCart();
      const created = res.data!;
      await setActiveOrderId(created.id);
      setPlacedOrder(created);
      setQrImage(null);
      setPaymentId(null);
      setWaitingForPayment(false);
      Alert.alert('Order placed successfully!');
      // router.replace(`/order/${res.data!.id}`);
      // router.replace(`/orders/${res.data!.id}`);
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
      const res = await paymentApi.createRazorpayQr(placedOrder.id);
      const image = res.data?.qrImageDataUrl || res.data?.qrImageUrl || null;
      if (!image) throw new Error('QR image was not generated');
      setQrImage(image);
      setPaymentId(res.data!.paymentId);
      setRazorpayTestMode(!!res.data?.testMode);
      setWaitingForPayment(true);
    } catch (err: any) {
      setError(err.message);
      setWaitingForPayment(false);
      setRazorpayTestMode(false);
    } finally {
      setPaying(false);
    }
  }

  async function handleSimulateTestPay() {
    if (!placedOrder || !paymentId) return;
    setPaying(true);
    setError('');
    try {
      await paymentApi.simulateTestPay(placedOrder.id, paymentId);
      Alert.alert('Test payment sent', 'Waiting for confirmation…');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  async function handlePayOffline() {
    if (!placedOrder) return;
    setPaying(true);
    setError('');
    try {
      await paymentApi.requestOffline(placedOrder.id);
      setOfflineModalOpen(true);
    } catch (err: any) {
      setError(err.message);
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
      await orderApi.cancel(placedOrder.id);
      cancelHandledRef.current = true;
      setPlacedOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
      await clearActiveOrderId();
      setOfflineModalOpen(false);
      setQrImage(null);
      setWaitingForPayment(false);
      Alert.alert('Order cancelled');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const existingItems = placedOrder?.items ?? [];
  const cartSubtotal = subtotal;
  const cartTax = cartSubtotal * TAX_RATE;
  const summarySubtotal = placedOrder
    ? placedOrder.subtotal + (hasPendingCart ? cartSubtotal : 0)
    : cartSubtotal;
  const summaryTax = placedOrder ? placedOrder.tax + (hasPendingCart ? cartTax : 0) : cartTax;
  const summaryTotal = summarySubtotal + summaryTax;
  const canPay = checkoutMode === 'placed' && orderIsOpen;
  const canCancel = placedOrder?.status === 'CONFIRMED' || placedOrder?.status === 'PENDING';
  const statusStep = STATUS_STEPS.findIndex((s) => s.key === placedOrder?.status);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Modal visible={paymentSuccessOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center p-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-900 mb-2 text-center">{PAYMENT_SUCCESS_TITLE}</Text>
            <Text className="text-gray-600 text-center">{PAYMENT_SUCCESS_MESSAGE}</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={offlineModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center p-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-900 mb-2 text-center">Pay at Counter</Text>
            <Text className="text-gray-700 text-center mb-2">
              Staff has been notified. Please wait for confirmation.
            </Text>
            <Text className="text-gray-500 text-sm text-center mb-4">
              Visit the counter to complete your payment. We'll update your order automatically once staff confirms.
            </Text>
            <Button title="Pay Online" onPress={handlePayOnline} loading={paying} disabled={paying} />
            <Pressable onPress={() => setOfflineModalOpen(false)} className="mt-3 py-2">
              <Text className="text-center text-sm text-gray-500">Continue waiting</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {error ? (
        <View className="bg-red-50 p-4 rounded-xl mb-4">
          <Text className="text-red-700 text-sm">{error}</Text>
        </View>
      ) : null}

      {isBusy && checkoutMode === 'pre-order' && (
        <View className="bg-amber-50 p-4 rounded-xl mb-4">
          <Text className="text-amber-800 font-semibold">Currently Unavailable</Text>
        </View>
      )}

      {placedOrder ? (
        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
          <Text className="text-base font-semibold text-gray-900">Order Status</Text>
          <Text className="text-sm text-gray-500 mt-1">#{placedOrder.orderNumber}</Text>
          {placedOrder.status === 'CANCELLED' ? (
            <View className="bg-red-50 p-3 rounded-lg mt-3">
              <Text className="text-red-700 text-sm font-medium">This order has been cancelled.</Text>
            </View>
          ) : (
            <View className="mt-3">
              {STATUS_STEPS.map((step, idx) => {
                const isComplete = statusStep >= 0 && idx <= statusStep;
                return (
                  <View key={step.key} className="flex-row items-center mb-2">
                    <View
                      className={`w-7 h-7 rounded-full items-center justify-center mr-3 ${
                        isComplete ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isComplete ? 'text-white' : 'text-gray-500'}`}>
                        {isComplete ? '\u2713' : idx + 1}
                      </Text>
                    </View>
                    <Text className={`text-sm ${isComplete ? 'text-primary-700 font-medium' : 'text-gray-400'}`}>
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <Text className="text-sm text-gray-600 mb-4">
          Place order now. Pay Online with UPI QR anytime after placing (same as web).
        </Text>
      )}

      {/* Order notes — commented out to match requested checkout UI
      <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
        <TextInput
          label={t('checkout.orderNotes')}
          placeholder="Any special instructions..."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={3}
        />
      </View>
      */}

      {checkoutMode === 'pre-order' && !user && (
        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
          <Text className="text-base font-semibold text-gray-900 mb-3">Contact Information</Text>
          <Pressable onPress={() => router.push('/(auth)/login')} className="mb-3">
            <Text className="text-primary-600 text-sm font-medium underline">{t('nav.login')} for faster checkout</Text>
          </Pressable>
          <TextInput placeholder="Full name *" value={guestName} onChangeText={setGuestName} />
          <TextInput placeholder="Email address *" value={guestEmail} onChangeText={setGuestEmail} keyboardType="email-address" />
          <TextInput placeholder="Phone (optional)" value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" />
        </View>
      )}

      <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
        <Text className="text-base font-semibold text-gray-900 mb-1">
          {checkoutMode === 'add-items' ? 'Add to your order' : t('checkout.orderSummary')}
        </Text>
        {checkoutMode === 'add-items' ? (
          <Text className="text-xs text-gray-500 mb-3">Existing order items and new items from your cart.</Text>
        ) : null}

        {existingItems.map((item) => (
          <View key={item.id} className="flex-row justify-between mb-2">
            <View className="flex-1 pr-2">
              <Text className="text-sm text-gray-700">
                <Text className="text-gray-400">{item.quantity}x </Text>
                {item.name}
              </Text>
              {item.options?.length ? (
                <Text className="text-xs text-gray-400">{item.options.map((o) => o.value).join(', ')}</Text>
              ) : null}
            </View>
            <Text className="text-sm font-medium">{formatCurrency(item.subtotal)}</Text>
          </View>
        ))}

        {items.map((item) => {
          const optTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
          return (
            <View key={item.id} className="flex-row justify-between mb-2">
              <View className="flex-1 pr-2">
                <Text className="text-sm text-gray-700">
                  <Text className="text-gray-400">{item.quantity}x </Text>
                  {item.name}
                  {placedOrder ? (
                    <Text className="text-primary-600 text-xs font-semibold">  NEW</Text>
                  ) : null}
                </Text>
                {item.options.length > 0 ? (
                  <Text className="text-xs text-gray-400">{item.options.map((o) => o.valueName).join(', ')}</Text>
                ) : null}
              </View>
              <Text className="text-sm font-medium">{formatCurrency((item.price + optTotal) * item.quantity)}</Text>
            </View>
          );
        })}

        <View className="border-t border-gray-100 mt-2 pt-2">
          <SummaryRow label={t('checkout.subtotal')} value={formatCurrency(summarySubtotal)} />
          <SummaryRow label={t('checkout.tax')} value={formatCurrency(summaryTax)} />
          <View className="flex-row justify-between mt-2 pt-2 border-t border-gray-100">
            <Text className="text-base font-bold">{t('checkout.total')}</Text>
            <Text className="text-base font-bold text-primary-600">{formatCurrency(summaryTotal)}</Text>
          </View>
        </View>

        {checkoutMode === 'pre-order' || checkoutMode === 'add-items' ? (
          hasPendingCart ? (
          <View className="mt-4">
            <Button
              title={
                checkoutMode === 'add-items'
                  ? loading
                    ? 'Processing...'
                    : `Add to Order — ${formatCurrency(cartSubtotal)} new`
                  : isBusy
                    ? 'Currently Unavailable'
                    : loading
                      ? 'Processing...'
                      : `${t('checkout.placeOrder')} - ${formatCurrency(summaryTotal)}`
              }
              onPress={handlePlaceOrder}
              loading={loading}
              disabled={loading || (checkoutMode === 'pre-order' && isBusy)}
            />
            {checkoutMode === 'add-items' ? (
              <View className="mt-2">
                <Button
                  title="Back to your order"
                  variant="outline"
                  onPress={() => clearCart()}
                />
              </View>
            ) : null}
          </View>
          ) : placedOrder?.status === 'CANCELLED' ? (
            <View className="mt-4">
              <Button title="Browse Menu" onPress={() => router.push('/(tabs)/menu')} />
            </View>
          ) : null
        ) : (
          <View className="mt-4 gap-2">
            <Button
              title="Browse Menu / Add Items"
              onPress={() => router.push('/(tabs)/menu')}
            />
            {placedOrder &&
            placedOrder.status !== 'CANCELLED' &&
            placedOrder.status !== 'COMPLETED' ? (
              <Pressable
                onPress={handleCancelOrder}
                disabled={!canCancel || cancelling}
                className={`py-3.5 rounded-xl items-center border-2 border-red-300 ${
                  !canCancel || cancelling ? 'opacity-40' : ''
                }`}
              >
                <Text className="text-red-700 font-semibold">
                  {cancelling ? 'Cancelling…' : 'Cancel Order'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {canPay ? (
        <View className="bg-white rounded-xl p-4 mb-8 border border-gray-100">
          <Text className="text-base font-semibold text-gray-900 mb-3">Payment</Text>
          <Button
            title={
              paying ? 'Creating QR…' : waitingForPayment ? 'Waiting for UPI payment…' : 'Pay Online (UPI QR)'
            }
            onPress={handlePayOnline}
            loading={paying && !waitingForPayment}
            disabled={paying || waitingForPayment}
          />
          <View className="h-2" />
          <Button
            title="Pay Offline"
            variant="outline"
            onPress={handlePayOffline}
            loading={paying}
            disabled={paying || waitingForPayment}
          />

          {qrImage ? (
            <View className="border border-gray-200 rounded-lg p-4 items-center mt-3">
              <Text className="text-sm font-semibold text-gray-900 mb-3">Scan Razorpay UPI QR</Text>
              <Image source={{ uri: qrImage }} style={{ width: 208, height: 208 }} resizeMode="contain" />
              {waitingForPayment ? (
                <View className="flex-row items-center mt-3">
                  <ActivityIndicator size="small" color="#ea580c" />
                  <Text className="text-sm text-gray-600 ml-2">Waiting for payment…</Text>
                </View>
              ) : null}
              <Text className="text-xs text-gray-500 text-center mt-2">
                Open PhonePe / GPay / any UPI app and scan this QR. No card checkout.
              </Text>
              {razorpayTestMode ? (
                <View className="w-full mt-3">
                  {/* <Button
                    title="Simulate test payment (test keys only)"
                    variant="outline"
                    onPress={handleSimulateTestPay}
                    loading={paying}
                    disabled={paying || !waitingForPayment}
                  /> */}
                </View>
              ) : null}
            </View>
          ) : (
            <Text className="text-xs text-gray-500 text-center mt-3">
              Pay Online shows a Razorpay UPI QR only (cards / netbanking removed).
            </Text>
          )}
        </View>
      ) : (
        <View className="mb-8" />
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className={`text-sm ${green ? 'text-green-600' : 'text-gray-600'}`}>{label}</Text>
      <Text className={`text-sm font-medium ${green ? 'text-green-600' : 'text-gray-900'}`}>{value}</Text>
    </View>
  );
}

// =============================================================================
// ORIGINAL MOBILE CHECKOUT CODE (kept for re-enable — do not delete)
// =============================================================================

// ----- BEGIN ORIGINAL packages/mobile/app/checkout.tsx -----
// ﻿import { useState, useEffect } from 'react';
// import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
// import { useRouter } from 'expo-router';
// import { useTranslation } from 'react-i18next';
// import { useCartStore } from '@/store/cart.store';
// import { useAuthStore } from '@/store/auth.store';
// import { orderApi, loyaltyApi, locationApi } from '@/api/endpoints';
// import { formatCurrency } from '@/lib/formatters';
// import { TAX_RATE, DEFAULT_DELIVERY_FEE } from '@/lib/constants';
// import Button from '@/components/ui/Button';
// import TextInput from '@/components/ui/TextInput';
// import EmptyState from '@/components/ui/EmptyState';
//
// type OrderType = 'delivery' | 'pickup';
// type PaymentMethod = 'cash' | 'stripe';
//
// export default function CheckoutScreen() {
//   const { t } = useTranslation();
//   const router = useRouter();
//   const items = useCartStore((s) => s.items);
//   const subtotal = useCartStore((s) => s.subtotal());
//   const clearCart = useCartStore((s) => s.clear);
//   const user = useAuthStore((s) => s.user);
//   const token = useAuthStore((s) => s.token);
//
//   const [orderType, setOrderType] = useState<OrderType>('delivery');
//   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
//   const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', zip: '' });
//   const [comment, setComment] = useState('');
//   const [couponCode, setCouponCode] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//
//   // Guest fields
//   const [guestName, setGuestName] = useState('');
//   const [guestEmail, setGuestEmail] = useState('');
//   const [guestPhone, setGuestPhone] = useState('');
//
//   // Loyalty
//   const [loyaltyBalance, setLoyaltyBalance] = useState(0);
//   const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);
//   const loyaltyDiscount = loyaltyRedeem / 100;
//
//   // Busy
//   const [isBusy, setIsBusy] = useState(false);
//
//   const deliveryFee = orderType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;
//   const tax = subtotal * TAX_RATE;
//   const total = subtotal + tax + deliveryFee - loyaltyDiscount;
//
//   useEffect(() => {
//     locationApi
//       .getAll()
//       .then((res) => {
//         const loc = res.data?.[0];
//         if (loc?.isBusy) setIsBusy(true);
//       })
//       .catch(() => {});
//   }, []);
//
//   useEffect(() => {
//     if (token) {
//       loyaltyApi
//         .getBalance()
//         .then((res) => {
//           if (res.data) setLoyaltyBalance(res.data.points);
//         })
//         .catch(() => {});
//     }
//   }, [token]);
//
//   if (items.length === 0) {
//     return (
//       <EmptyState
//         title={t('checkout.emptyCart')}
//         actionLabel={t('checkout.browseMenu')}
//         onAction={() => router.replace('/(tabs)/menu')}
//       />
//     );
//   }
//
//   async function handlePlaceOrder() {
//     setError('');
//     setLoading(true);
//
//     try {
//       const orderItems = items.map((item) => ({
//         menuItemId: item.menuItemId,
//         quantity: item.quantity,
//         comment: item.comment,
//         options: item.options.map((o) => ({
//           menuOptionValueId: o.valueId,
//           name: o.optionName,
//           value: o.valueName,
//           priceModifier: o.priceModifier,
//         })),
//       }));
//
//       const body: Record<string, unknown> = {
//         orderType: orderType.toUpperCase(),
//         paymentMethod,
//         items: orderItems,
//         comment: comment || undefined,
//         couponCode: couponCode || undefined,
//       };
//
//       if (orderType === 'delivery') {
//         body.address = address;
//       }
//
//       if (!user) {
//         body.guestName = guestName;
//         body.guestEmail = guestEmail;
//         body.guestPhone = guestPhone || undefined;
//       }
//
//       if (loyaltyRedeem > 0) {
//         body.loyaltyPointsRedeem = loyaltyRedeem;
//       }
//
//       const res = await orderApi.place(body);
//       clearCart();
//       router.replace(`/order/${res.data!.id}`);
//     } catch (err: any) {
//       setError(err.message || t('common.error'));
//     } finally {
//       setLoading(false);
//     }
//   }
//
//   return (
//     <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
//       {error ? (
//         <View className="bg-red-50 p-4 rounded-xl mb-4">
//           <Text className="text-red-700 text-sm">{error}</Text>
//         </View>
//       ) : null}
//
//       {isBusy && (
//         <View className="bg-amber-50 p-4 rounded-xl mb-4">
//           <Text className="text-amber-800 font-semibold">Currently Unavailable</Text>
//         </View>
//       )}
//
//       {/* Order Type */}
//       <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//         <Text className="text-base font-semibold text-gray-900 mb-3">{t('checkout.orderType')}</Text>
//         <View className="flex-row gap-3">
//           <Pressable
//             onPress={() => setOrderType('delivery')}
//             className={`flex-1 py-3 rounded-lg border-2 items-center ${
//               orderType === 'delivery' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
//             }`}
//           >
//             <Text className={orderType === 'delivery' ? 'text-primary-700 font-semibold' : 'text-gray-600'}>
//               {t('checkout.delivery')}
//             </Text>
//           </Pressable>
//           <Pressable
//             onPress={() => setOrderType('pickup')}
//             className={`flex-1 py-3 rounded-lg border-2 items-center ${
//               orderType === 'pickup' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
//             }`}
//           >
//             <Text className={orderType === 'pickup' ? 'text-primary-700 font-semibold' : 'text-gray-600'}>
//               {t('checkout.pickup')}
//             </Text>
//           </Pressable>
//         </View>
//       </View>
//
//       {/* Delivery Address */}
//       {orderType === 'delivery' && (
//         <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//           <Text className="text-base font-semibold text-gray-900 mb-3">{t('checkout.deliveryAddress')}</Text>
//           <TextInput
//             placeholder={t('checkout.addressLine1')}
//             value={address.line1}
//             onChangeText={(v) => setAddress({ ...address, line1: v })}
//           />
//           <TextInput
//             placeholder={t('checkout.addressLine2')}
//             value={address.line2}
//             onChangeText={(v) => setAddress({ ...address, line2: v })}
//           />
//           <View className="flex-row gap-2">
//             <View className="flex-1">
//               <TextInput placeholder={t('checkout.city')} value={address.city} onChangeText={(v) => setAddress({ ...address, city: v })} />
//             </View>
//             <View className="flex-1">
//               <TextInput placeholder={t('checkout.state')} value={address.state} onChangeText={(v) => setAddress({ ...address, state: v })} />
//             </View>
//             <View className="flex-1">
//               <TextInput placeholder={t('checkout.zipCode')} value={address.zip} onChangeText={(v) => setAddress({ ...address, zip: v })} />
//             </View>
//           </View>
//         </View>
//       )}
//
//       {/* Notes */}
//       <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//         <TextInput
//           label={t('checkout.orderNotes')}
//           placeholder="Any special instructions..."
//           value={comment}
//           onChangeText={setComment}
//           multiline
//           numberOfLines={3}
//         />
//       </View>
//
//       {/* Coupon */}
//       <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//         <Text className="text-base font-semibold text-gray-900 mb-3">{t('checkout.couponCode')}</Text>
//         <View className="flex-row gap-2">
//           <View className="flex-1">
//             <TextInput
//               placeholder="Enter code"
//               value={couponCode}
//               onChangeText={setCouponCode}
//               autoCapitalize="characters"
//             />
//           </View>
//           <Pressable className="bg-gray-100 px-4 rounded-lg justify-center">
//             <Text className="text-gray-700 font-medium text-sm">{t('checkout.apply')}</Text>
//           </Pressable>
//         </View>
//       </View>
//
//       {/* Loyalty */}
//       {user && loyaltyBalance > 0 && (
//         <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//           <Text className="text-base font-semibold text-gray-900 mb-2">Loyalty Points</Text>
//           <Text className="text-sm text-gray-500 mb-3">
//             You have <Text className="font-bold text-primary-600">{loyaltyBalance}</Text> points (100 = $1.00)
//           </Text>
//           <TextInput
//             placeholder="Points to redeem"
//             value={loyaltyRedeem > 0 ? String(loyaltyRedeem) : ''}
//             onChangeText={(v) => setLoyaltyRedeem(Math.max(0, parseInt(v) || 0))}
//             keyboardType="numeric"
//           />
//         </View>
//       )}
//
//       {/* Payment Method */}
//       <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//         <Text className="text-base font-semibold text-gray-900 mb-3">{t('checkout.paymentMethod')}</Text>
//         <Pressable
//           onPress={() => setPaymentMethod('cash')}
//           className={`p-3 rounded-lg border-2 mb-2 ${
//             paymentMethod === 'cash' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
//           }`}
//         >
//           <Text className={paymentMethod === 'cash' ? 'text-primary-700 font-medium' : 'text-gray-600'}>
//             {t('checkout.cashOnDelivery')}
//           </Text>
//         </Pressable>
//         <Pressable
//           onPress={() => setPaymentMethod('stripe')}
//           className={`p-3 rounded-lg border-2 ${
//             paymentMethod === 'stripe' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
//           }`}
//         >
//           <Text className={paymentMethod === 'stripe' ? 'text-primary-700 font-medium' : 'text-gray-600'}>
//             {t('checkout.creditCard')}
//           </Text>
//         </Pressable>
//       </View>
//
//       {/* Guest Info */}
//       {!user && (
//         <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//           <Text className="text-base font-semibold text-gray-900 mb-3">Contact Information</Text>
//           <Pressable onPress={() => router.push('/(auth)/login')} className="mb-3">
//             <Text className="text-primary-600 text-sm font-medium underline">{t('nav.login')} for faster checkout</Text>
//           </Pressable>
//           <TextInput placeholder="Full name *" value={guestName} onChangeText={setGuestName} />
//           <TextInput placeholder="Email address *" value={guestEmail} onChangeText={setGuestEmail} keyboardType="email-address" />
//           <TextInput placeholder="Phone (optional)" value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" />
//         </View>
//       )}
//
//       {/* Order Summary */}
//       <View className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
//         <Text className="text-base font-semibold text-gray-900 mb-3">{t('checkout.orderSummary')}</Text>
//         {items.map((item) => {
//           const optTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
//           return (
//             <View key={item.id} className="flex-row justify-between mb-2">
//               <Text className="text-sm text-gray-700">
//                 <Text className="text-gray-400">{item.quantity}x </Text>
//                 {item.name}
//               </Text>
//               <Text className="text-sm font-medium">{formatCurrency((item.price + optTotal) * item.quantity)}</Text>
//             </View>
//           );
//         })}
//         <View className="border-t border-gray-100 mt-2 pt-2">
//           <SummaryRow label={t('checkout.subtotal')} value={formatCurrency(subtotal)} />
//           <SummaryRow label={t('checkout.tax')} value={formatCurrency(tax)} />
//           {orderType === 'delivery' && (
//             <SummaryRow label={t('checkout.deliveryFee')} value={formatCurrency(deliveryFee)} />
//           )}
//           {loyaltyDiscount > 0 && (
//             <SummaryRow label="Loyalty Discount" value={`-${formatCurrency(loyaltyDiscount)}`} green />
//           )}
//           <View className="flex-row justify-between mt-2 pt-2 border-t border-gray-100">
//             <Text className="text-base font-bold">{t('checkout.total')}</Text>
//             <Text className="text-base font-bold text-primary-600">{formatCurrency(total)}</Text>
//           </View>
//         </View>
//       </View>
//
//       <View className="mb-8">
//         <Button
//           title={isBusy ? 'Currently Unavailable' : `${t('checkout.placeOrder')} - ${formatCurrency(total)}`}
//           onPress={handlePlaceOrder}
//           loading={loading}
//           disabled={isBusy}
//         />
//       </View>
//     </ScrollView>
//   );
// }
//
// function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
//   return (
//     <View className="flex-row justify-between py-1">
//       <Text className={`text-sm ${green ? 'text-green-600' : 'text-gray-600'}`}>{label}</Text>
//       <Text className={`text-sm font-medium ${green ? 'text-green-600' : 'text-gray-900'}`}>{value}</Text>
//     </View>
//   );
// }
//
// ----- END ORIGINAL -----