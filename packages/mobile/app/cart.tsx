import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/store/cart.store';
import { formatCurrency } from '@/lib/formatters';
import { getActiveOrderIds } from '@/lib/activeOrder';
import { orderApi } from '@/api/endpoints';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'New',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

interface ExistingLine {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  optionsLabel: string;
  status: string;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export default function CartScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clear);
  const subtotal = useCartStore((s) => s.subtotal());
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [existingItems, setExistingItems] = useState<ExistingLine[]>([]);
  const [existingSubtotal, setExistingSubtotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const ids = await getActiveOrderIds();
        if (!active) return;
        setHasActiveOrder(ids.length > 0);
        if (ids.length === 0) {
          setExistingItems([]);
          setExistingSubtotal(0);
          return;
        }
        const loaded = await Promise.all(
          ids.map((id) => orderApi.getById(id).then((res) => res.data ?? null).catch(() => null)),
        );
        if (!active) return;
        const lines: ExistingLine[] = [];
        let sum = 0;
        for (const order of loaded) {
          if (!order || order.status === 'COMPLETED' || order.status === 'CANCELLED') continue;
          sum += order.subtotal;
          for (const item of order.items) {
            lines.push({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              lineTotal: item.subtotal,
              optionsLabel: (item.options || []).map((o) => o.value).filter(Boolean).join(', '),
              status: order.status,
            });
          }
        }
        setExistingItems(lines);
        setExistingSubtotal(sum);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  if (items.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          title={t('cart.empty')}
          actionLabel={t('cart.browsMenu')}
          onAction={() => {
            router.dismiss();
            router.push('/(tabs)/menu');
          }}
        />
        {hasActiveOrder ? (
          <View className="px-4 pb-6">
            <Button
              title="Back to your order"
              variant="outline"
              onPress={() => {
                router.dismiss();
                router.push('/checkout');
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {existingItems.length > 0 ? (
          <View className="mb-5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Previous order
            </Text>
            {existingItems.map((item) => (
              <View key={item.id} className="bg-white rounded-xl p-4 border border-gray-100 mb-3">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-3">
                    <View className="flex-row items-center flex-wrap">
                      <Text className="text-gray-800 font-semibold text-base flex-shrink mr-2">{item.name}</Text>
                      <View className="bg-gray-100 rounded px-2 py-0.5">
                        <Text className="text-xs font-semibold uppercase text-gray-600">
                          {statusLabel(item.status)}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-gray-400 text-xs mt-1">Qty {item.quantity}</Text>
                    {item.optionsLabel ? (
                      <Text className="text-gray-400 text-xs mt-0.5">{item.optionsLabel}</Text>
                    ) : null}
                  </View>
                  <Text className="text-gray-500 font-semibold">{formatCurrency(item.lineTotal)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {existingItems.length > 0 ? (
          <Text className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-3">
            Adding now
          </Text>
        ) : null}

        {items.map((item) => {
          const optionsTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
          const lineTotal = (item.price + optionsTotal) * item.quantity;
          return (
            <View key={item.id} className="bg-white rounded-xl p-4 border border-gray-100 mb-3">
              <View className="flex-row justify-between mb-1">
                <View className="flex-1 pr-3 flex-row items-center flex-wrap">
                  <Text className="text-gray-900 font-semibold text-base">{item.name}</Text>
                  {existingItems.length > 0 ? (
                    <View className="bg-orange-50 rounded px-1.5 py-0.5 ml-2">
                      <Text className="text-[10px] font-semibold uppercase text-primary-600">New</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-primary-600 font-bold">{formatCurrency(lineTotal)}</Text>
              </View>

              {item.options.length > 0 && (
                <Text className="text-gray-400 text-xs mb-2">
                  {item.options.map((o) => o.valueName).join(', ')}
                </Text>
              )}

              <View className="flex-row items-center justify-between mt-2">
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                  >
                    <Text className="text-gray-600 font-bold">-</Text>
                  </Pressable>
                  <Text className="mx-4 text-base font-semibold text-gray-900">{item.quantity}</Text>
                  <Pressable
                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                  >
                    <Text className="text-gray-600 font-bold">+</Text>
                  </Pressable>
                </View>

                <Pressable onPress={() => removeItem(item.id)}>
                  <Text className="text-red-500 text-sm font-medium">{t('cart.remove')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View className="p-4 border-t border-gray-200 bg-white">
        {existingItems.length > 0 ? (
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-500 text-sm">Previous order</Text>
            <Text className="text-gray-500 font-medium">{formatCurrency(existingSubtotal)}</Text>
          </View>
        ) : null}
        <View className="flex-row justify-between mb-3">
          <Text className="text-gray-600 text-base">
            {existingItems.length > 0 ? 'New items' : t('cart.subtotal')}
          </Text>
          <Text className="text-gray-900 text-lg font-bold">{formatCurrency(subtotal)}</Text>
        </View>
        {hasActiveOrder ? (
          <Text className="text-xs text-gray-500 mb-3">These items will be added to your open order.</Text>
        ) : null}
        <Button
          title={hasActiveOrder ? 'Add to Order' : t('cart.checkout')}
          onPress={() => {
            router.dismiss();
            router.push('/checkout');
          }}
        />
        {hasActiveOrder ? (
          <View className="mt-2">
            <Button
              title="Back to your order"
              variant="outline"
              onPress={() => {
                clearCart();
                router.dismiss();
                router.push('/checkout');
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
