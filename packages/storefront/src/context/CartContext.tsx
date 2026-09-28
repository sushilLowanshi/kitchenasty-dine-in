import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { apiUrl, API_ORIGIN } from '../lib/apiBase.js';
import { kioskIdFromPath } from '../lib/kioskPath.js';

export interface CartItemOption {
  optionId: string;
  optionName: string;
  valueId: string;
  valueName: string;
  priceModifier: number;
}

export interface CartItem {
  id: string; // unique cart line ID
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  options: CartItemOption[];
  comment?: string;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, 'id'>) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  itemCount: number;
  subtotal: number;
  /** True while hydrating shared kiosk cart */
  cartLoading: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

let nextId = 1;

function newLineId(): string {
  return `c-${Date.now()}-${nextId++}`;
}

async function putSharedCart(kioskId: string, items: CartItem[]): Promise<void> {
  await fetch(apiUrl(`/api/table-kiosks/${encodeURIComponent(kioskId)}/cart`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const kioskId = kioskIdFromPath(location.pathname);
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(!!kioskId);
  const syncingRef = useRef(false);

  // Hydrate + socket sync for table screens
  useEffect(() => {
    if (!kioskId) {
      setCartLoading(false);
      return;
    }

    let cancelled = false;
    setCartLoading(true);

    fetch(apiUrl(`/api/table-kiosks/${encodeURIComponent(kioskId)}/cart`))
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setItems(Array.isArray(data.data?.items) ? data.data.items : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCartLoading(false);
      });

    const socket: Socket = io(API_ORIGIN || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.emit('join:kiosk', kioskId);
    socket.on('kiosk:cartUpdated', (payload: { kioskId?: string; items?: CartItem[] }) => {
      if (payload?.kioskId && payload.kioskId !== kioskId) return;
      if (syncingRef.current) return;
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    });

    return () => {
      cancelled = true;
      socket.emit('leave:kiosk', kioskId);
      socket.disconnect();
    };
  }, [kioskId]);

  const persist = useCallback(
    (next: CartItem[]) => {
      if (!kioskId) return;
      syncingRef.current = true;
      putSharedCart(kioskId, next)
        .catch(() => {})
        .finally(() => {
          window.setTimeout(() => {
            syncingRef.current = false;
          }, 300);
        });
    },
    [kioskId]
  );

  const addItem = useCallback(
    (item: Omit<CartItem, 'id'>) => {
      setItems((prev) => {
        const next = [...prev, { ...item, id: newLineId() }];
        persist(next);
        return next;
      });
      setIsOpen(true);
    },
    [persist]
  );

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      setItems((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((i) => i.id !== id)
            : prev.map((i) => (i.id === id ? { ...i, quantity } : i));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clear = useCallback(() => {
    setItems([]);
    if (kioskId) persist([]);
  }, [kioskId, persist]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const subtotal = items.reduce((sum, item) => {
    const optionsTotal = item.options.reduce((s, o) => s + o.priceModifier, 0);
    return sum + (item.price + optionsTotal) * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        setIsOpen,
        addItem,
        updateQuantity,
        removeItem,
        clear,
        itemCount,
        subtotal,
        cartLoading,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
