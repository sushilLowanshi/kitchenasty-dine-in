import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../lib/constants';

interface OrderStatusUpdate {
  id: string;
  orderNumber: string;
  status: string;
  orderType: string;
}

interface PaymentCompleted {
  orderId: string;
  status: string;
}

export function useOrderSocket(
  orderId: string | undefined,
  onStatusUpdate: (data: OrderStatusUpdate) => void,
  onPaymentCompleted?: (data: PaymentCompleted) => void,
) {
  const socketRef = useRef<Socket | null>(null);
  const statusRef = useRef(onStatusUpdate);
  const paymentRef = useRef(onPaymentCompleted);
  statusRef.current = onStatusUpdate;
  paymentRef.current = onPaymentCompleted;

  useEffect(() => {
    if (!orderId) return;

    const socket = io(API_BASE_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.emit('join:order', orderId);

    socket.on('order:statusUpdate', (data: OrderStatusUpdate) => {
      if (data.id === orderId) {
        statusRef.current(data);
      }
    });

    socket.on('payment:completed', (data: PaymentCompleted) => {
      if (data.orderId === orderId) {
        paymentRef.current?.(data);
      }
    });

    return () => {
      socket.emit('leave:order', orderId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  return { disconnect };
}
