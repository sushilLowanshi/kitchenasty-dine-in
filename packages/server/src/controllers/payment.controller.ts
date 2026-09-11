import { Request, Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { getStripe } from '../lib/stripe.js';
import prisma from '../lib/db.js';
import { createPayPalOrder, capturePayPalOrder } from '../lib/paypal.js';

// /** Local demo: auto-complete QR payment after this many ms (scan simulation). */
// const RAZORPAY_DEMO_AUTO_MS = Number(process.env.RAZORPAY_DEMO_AUTO_MS || 8000);

function getRazorpayAuthHeader(): string | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

/** Razorpay UPI only works with IN mobiles (6–9…); never pass +1 / US numbers. */
function normalizeIndianContact(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  let ten = '';
  if (digits.length === 10) {
    ten = digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    ten = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    ten = digits.slice(1);
  } else {
    // e.g. 11-digit US (+1…) or other — omit
    return '';
  }
  // Indian mobile numbers start with 6–9
  if (!/^[6-9]\d{9}$/.test(ten)) return '';
  return ten;
}

function getCheckoutBaseUrl(req: Request): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }

  const origin = req.get('origin');
  if (origin) {
    return origin;
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Ignore malformed referer and fall back to localhost default.
    }
  }

  return 'http://localhost:5174';
}

export async function createPaymentIntent(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { email: true, name: true } } },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  // Check if order already has a completed payment
  const existingPayment = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (existingPayment) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  // Use the registered customer's email when present, fall back to the
  // guest-checkout email — both produce Stripe receipt emails + show up
  // attached to the PaymentIntent in the dashboard.
  const receiptEmail = order.customer?.email ?? order.guestEmail ?? undefined;

  try {
    const stripe = await getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100), // cents
      currency: 'eur',
      receipt_email: receiptEmail,
      // Let Stripe pick which payment methods to surface — covers cards,
      // Apple Pay and Google Pay on PaymentSheet without extra config.
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name ?? order.guestName ?? '',
      },
    });

    // Create payment record
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'STRIPE',
        status: 'PENDING',
        amount: order.total,
        transactionId: paymentIntent.id,
      },
    });

    res.json({
      success: true,
      data: { clientSecret: paymentIntent.client_secret },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Payment creation failed' });
  }
}

/// Creates a Stripe Checkout Session for the order. The customer is
/// redirected to Stripe's hosted page (cards + Apple Pay + Google Pay +
/// Klarna + SEPA come for free), and Stripe redirects back to the
/// order-confirmation page on success.
///
/// We attach `orderId` to BOTH the session metadata and the underlying
/// payment intent so the existing `payment_intent.succeeded` webhook
/// path still flips Order.status — the new `checkout.session.completed`
/// case below is just a belt-and-braces.
export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { email: true } },
      items: true,
    },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (existingPayment) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  const publicUrl = getCheckoutBaseUrl(req);
  const customerEmail = order.customer?.email ?? order.guestEmail ?? undefined;

  try {
    const stripe = await getStripe();

    const lineItems = order.items.map((it) => ({
      price_data: {
        currency: 'eur',
        product_data: { name: it.name },
        unit_amount: Math.round(it.unitPrice * 100),
      },
      quantity: it.quantity,
    }));

    if (order.deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Delivery fee' },
          unit_amount: Math.round(order.deliveryFee * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${publicUrl}/order/${order.id}?paid=true`,
      cancel_url: `${publicUrl}/checkout`,
      customer_email: customerEmail,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
      payment_intent_data: {
        receipt_email: customerEmail,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
      },
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'STRIPE',
        status: 'PENDING',
        amount: order.total,
        transactionId: session.id,
      },
    });

    res.json({
      success: true,
      data: { url: session.url, sessionId: session.id },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Checkout session creation failed' });
  }
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    res.status(500).json({ success: false, error: 'Webhook secret not configured' });
    return;
  }

  let event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    res.status(400).json({ success: false, error: `Webhook error: ${err.message}` });
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      if (orderId) {
        // Update payment status
        await prisma.payment.updateMany({
          where: { transactionId: paymentIntent.id },
          data: { status: 'COMPLETED' },
        });

        // Update order status to confirmed
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED' },
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      await prisma.payment.updateMany({
        where: { transactionId: paymentIntent.id },
        data: { status: 'FAILED' },
      });
      break;
    }

    case 'checkout.session.completed': {
      // Stripe Checkout (hosted) finished. payment_intent.succeeded also
      // fires for the same flow, but the session event lets us mark the
      // Payment row (whose transactionId is the session.id) as completed
      // and gives us a second chance to flip Order.status.
      const session = event.data.object as { id: string; payment_status?: string; metadata?: { orderId?: string } };
      const orderId = session.metadata?.orderId;
      if (orderId && session.payment_status === 'paid') {
        await prisma.payment.updateMany({
          where: { transactionId: session.id },
          data: { status: 'COMPLETED' },
        });
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED' },
        });
      }
      break;
    }
  }

  res.json({ received: true });
}

export async function markCashPayment(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const alreadyPaid = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (alreadyPaid) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  // Complete offline/cash payment + mark order COMPLETED (dine-in bill flow)
  const pendingCash = await prisma.payment.findFirst({
    where: { orderId, method: 'CASH', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  let payment;
  if (pendingCash) {
    payment = await prisma.payment.update({
      where: { id: pendingCash.id },
      data: { status: 'COMPLETED' },
    });
  } else {
    payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'CASH',
        status: 'COMPLETED',
        amount: order.total,
      },
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'COMPLETED' },
  });

  const { emitOrderStatusUpdate } = await import('../lib/socket.js');
  emitOrderStatusUpdate({
    id: order.id,
    orderNumber: order.orderNumber,
    status: 'COMPLETED',
    orderType: order.orderType,
    customerId: order.customerId,
  });

  res.status(201).json({ success: true, data: payment });
}

export async function createPayPalPayment(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (existingPayment) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  try {
    const paypalOrder = await createPayPalOrder(order.total, order.orderNumber);

    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'PAYPAL',
        status: 'PENDING',
        amount: order.total,
        transactionId: paypalOrder.id,
      },
    });

    res.json({
      success: true,
      data: { paypalOrderId: paypalOrder.id, approvalUrl: paypalOrder.approvalUrl },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'PayPal order creation failed' });
  }
}

export async function capturePayPalPayment(req: Request, res: Response): Promise<void> {
  const { paypalOrderId, orderId } = req.body;

  if (!paypalOrderId || !orderId) {
    res.status(400).json({ success: false, error: 'paypalOrderId and orderId are required' });
    return;
  }

  try {
    const result = await capturePayPalOrder(paypalOrderId);

    if (result.status === 'COMPLETED') {
      await prisma.payment.updateMany({
        where: { transactionId: paypalOrderId },
        data: { status: 'COMPLETED' },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' },
      });

      res.json({ success: true, data: { status: 'COMPLETED' } });
    } else {
      res.status(400).json({ success: false, error: 'PayPal capture failed', data: result });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'PayPal capture failed' });
  }
}

// ============================================================
// Razorpay QR — success only after real payment (webhook / Razorpay poll)
// ============================================================

async function completeRazorpayPayment(paymentId: string, orderId: string): Promise<{
  status: string;
  paymentId: string;
} | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, orderId },
  });
  if (!payment || payment.status === 'COMPLETED') {
    return payment ? { status: 'COMPLETED', paymentId: payment.id } : null;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || ['COMPLETED', 'CANCELLED'].includes(order.status)) {
    return null;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'COMPLETED' },
  });

  const { emitOrderStatusUpdate, emitPaymentCompleted } = await import('../lib/socket.js');

  // Bill pay at end of meal → complete order. Early/prepaid pay keeps kitchen status
  // (PENDING/New) so staff still Confirm → Preparing as usual.
  if (['READY', 'SERVED'].includes(order.status)) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
    });
    emitOrderStatusUpdate({
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'COMPLETED',
      orderType: order.orderType,
      customerId: order.customerId,
    });
  }

  emitPaymentCompleted({
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    status: 'COMPLETED',
  });

  return { status: 'COMPLETED', paymentId: payment.id };
}

// function scheduleDemoAutoComplete(paymentId: string, orderId: string): void {
//   const delay = Number.isFinite(RAZORPAY_DEMO_AUTO_MS) ? Math.max(3000, RAZORPAY_DEMO_AUTO_MS) : 8000;
//   setTimeout(() => {
//     completeRazorpayPayment(paymentId, orderId).catch(() => {});
//   }, delay);
// }

// Unused by storefront (QR flow only) — kept for reference; routes commented in payment.routes.ts
/** Create Razorpay Order + return Checkout.js options (opens full Razorpay screen). */
export async function createRazorpayCheckoutOrder(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { name: true, email: true, phone: true } } },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    res.status(400).json({
      success: false,
      error: 'Order is already completed or cancelled',
    });
    return;
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (existingPayment) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const auth = getRazorpayAuthHeader();
  if (!auth || !keyId || !keySecret) {
    res.status(503).json({
      success: false,
      error:
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in packages/server/.env',
    });
    return;
  }

  await prisma.payment.updateMany({
    where: { orderId, method: 'RAZORPAY', status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  const amountPaise = Math.round(order.total * 100);
  const currency = (process.env.RAZORPAY_CURRENCY || 'INR').toUpperCase();

  let rzpOrder: { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  try {
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: order.orderNumber.slice(0, 40),
        notes: { orderId: order.id, orderNumber: order.orderNumber },
      }),
    });
    rzpOrder = (await rzpRes.json()) as typeof rzpOrder;
    if (!rzpRes.ok || !rzpOrder.id) {
      res.status(502).json({
        success: false,
        error: rzpOrder.error?.description || 'Failed to create Razorpay order',
      });
      return;
    }
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: err.message || 'Razorpay Orders API failed',
    });
    return;
  }

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: 'RAZORPAY',
      status: 'PENDING',
      amount: order.total,
      transactionId: rzpOrder.id!,
      metadata: {
        demo: false,
        provider: 'razorpay',
        checkout: true,
        razorpayOrderId: rzpOrder.id!,
        testMode: keyId.startsWith('rzp_test_'),
      } satisfies Prisma.InputJsonValue,
    },
  });

  res.json({
    success: true,
    data: {
      paymentId: payment.id,
      keyId,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency,
      name: process.env.RAZORPAY_PAYEE_NAME || 'KitchenAsty',
      description: `Order ${order.orderNumber}`,
      prefill: {
        name: order.customer?.name || order.guestName || '',
        email: order.customer?.email || order.guestEmail || '',
        // Only IN mobiles (6–9…). Empty / +1 / 555… → fallback so Checkout shows UPI/QR
        contact: normalizeIndianContact(order.customer?.phone || order.guestPhone) || '9876543210',
        method: 'upi',
      },
      // Hint for storefront Checkout.js display (UPI QR first)
      checkoutConfig: {
        display: {
          blocks: {
            upi_qr: {
              name: 'Pay with UPI / QR',
              instruments: [{ method: 'upi', flows: ['qr', 'collect', 'intent'] }],
            },
          },
          sequence: ['block.upi_qr', 'upi', 'card', 'netbanking', 'wallet'],
          preferences: { show_default_blocks: true },
        },
      },
      testMode: keyId.startsWith('rzp_test_'),
      message: 'Open Razorpay Checkout to complete payment',
    },
  });
}

/** Verify Checkout.js payment signature, then mark paid. */
export async function verifyRazorpayCheckout(req: Request, res: Response): Promise<void> {
  const { orderId, paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    orderId?: string;
    paymentId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };

  if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({
      success: false,
      error: 'orderId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
    });
    return;
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keySecret) {
    res.status(503).json({ success: false, error: 'Razorpay is not configured' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    res.status(400).json({ success: false, error: 'Invalid Razorpay payment signature' });
    return;
  }

  const payment = paymentId
    ? await prisma.payment.findFirst({ where: { id: paymentId, orderId } })
    : await prisma.payment.findFirst({
        where: { orderId, method: 'RAZORPAY', transactionId: razorpay_order_id },
        orderBy: { createdAt: 'desc' },
      });

  if (!payment) {
    res.status(404).json({ success: false, error: 'Pending Razorpay payment not found' });
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      transactionId: razorpay_payment_id,
      metadata: {
        ...((payment.metadata as object) || {}),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        verified: true,
      },
    },
  });

  const result = await completeRazorpayPayment(payment.id, orderId);
  if (!result) {
    res.status(400).json({ success: false, error: 'Could not complete payment' });
    return;
  }

  res.json({ success: true, data: result });
}

/** Ask Razorpay if this QR / payment link was paid (status poll — no fake auto-success). */
async function syncRazorpayQrFromApi(payment: {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  transactionId: string | null;
  metadata?: unknown;
}): Promise<string> {
  if (payment.status === 'COMPLETED' || !payment.transactionId) {
    return payment.status;
  }

  const auth = getRazorpayAuthHeader();
  if (!auth) return payment.status;

  const txn = payment.transactionId;
  const meta = (payment.metadata || {}) as { mode?: string };

  try {
    // Native QR code (qr_…)
    if (txn.startsWith('qr_') || meta.mode === 'qr_code') {
      const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${txn}`, {
        headers: { Authorization: auth },
      });
      const rzpData = (await rzpRes.json()) as {
        status?: string;
        close_reason?: string;
        payments_amount_received?: number;
      };
      if (rzpRes.ok) {
        const received = Number(rzpData.payments_amount_received || 0);
        const expectedPaise = Math.round(payment.amount * 100);
        const paid =
          received >= expectedPaise ||
          rzpData.close_reason === 'paid' ||
          (rzpData.status === 'closed' && received > 0);
        if (paid) {
          await completeRazorpayPayment(payment.id, payment.orderId);
          return 'COMPLETED';
        }
      }
    }

    // Payment link (plink_…) — UPI-only QR fallback
    if (txn.startsWith('plink_') || meta.mode === 'payment_link') {
      const linkRes = await fetch(`https://api.razorpay.com/v1/payment_links/${txn}`, {
        headers: { Authorization: auth },
      });
      const linkData = (await linkRes.json()) as {
        status?: string;
        amount_paid?: number;
      };
      if (linkRes.ok) {
        const paid =
          linkData.status === 'paid' ||
          Number(linkData.amount_paid || 0) >= Math.round(payment.amount * 100);
        if (paid) {
          await completeRazorpayPayment(payment.id, payment.orderId);
          return 'COMPLETED';
        }
      }
    }
  } catch {
    // Keep PENDING if Razorpay unreachable
  }

  return payment.status;
}

/** Create Razorpay UPI QR — QR Codes API, else Payment Link (UPI only) + QR image. */
export async function createRazorpayDemoQr(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    res.status(400).json({
      success: false,
      error: 'Order is already completed or cancelled',
    });
    return;
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (existingPayment) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const auth = getRazorpayAuthHeader();
  if (!auth || !keyId || !keySecret) {
    res.status(503).json({
      success: false,
      error:
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in packages/server/.env',
    });
    return;
  }

  await prisma.payment.updateMany({
    where: { orderId, method: 'RAZORPAY', status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  const amountPaise = Math.round(order.total * 100);
  const isTestKey = keyId.startsWith('rzp_test_');
  const payee = process.env.RAZORPAY_PAYEE_NAME || 'KitchenAsty';

  let transactionId = '';
  let qrImageUrl: string | null = null;
  let payUrl: string | null = null;
  let mode: 'qr_code' | 'payment_link' = 'qr_code';
  let lastError = '';

  // 1) Prefer native Razorpay UPI QR Codes
  try {
    const rzpRes = await fetch('https://api.razorpay.com/v1/payments/qr_codes', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'upi_qr',
        name: payee,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amountPaise,
        description: `Order ${order.orderNumber}`,
        notes: { orderId: order.id, orderNumber: order.orderNumber },
      }),
    });
    const rzpData = (await rzpRes.json()) as {
      id?: string;
      image_url?: string;
      error?: { description?: string };
    };
    if (rzpRes.ok && rzpData.id) {
      transactionId = rzpData.id;
      qrImageUrl = rzpData.image_url || null;
      mode = 'qr_code';
    } else {
      lastError = rzpData.error?.description || `QR Codes API HTTP ${rzpRes.status}`;
    }
  } catch (err: any) {
    lastError = err.message || 'QR Codes API failed';
  }

  // 2) Fallback: Payment Link with UPI only (no card / netbanking / wallet) + QR of link
  if (!transactionId) {
    try {
      const linkRes = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          accept_partial: false,
          description: `Order ${order.orderNumber}`,
          customer: {
            name: order.guestName || payee,
            email: order.guestEmail || undefined,
            contact: normalizeIndianContact(order.guestPhone) || '9876543210',
          },
          notify: { sms: false, email: false },
          reminder_enable: false,
          notes: { orderId: order.id, orderNumber: order.orderNumber },
          options: {
            checkout: {
              // Hide cards — UPI / QR only
              method: {
                upi: true,
                card: false,
                netbanking: false,
                wallet: false,
                emi: false,
                cardless_emi: false,
                paylater: false,
              },
            },
          },
        }),
      });
      const linkData = (await linkRes.json()) as {
        id?: string;
        short_url?: string;
        error?: { description?: string };
      };
      if (linkRes.ok && linkData.id && linkData.short_url) {
        transactionId = linkData.id;
        payUrl = linkData.short_url;
        mode = 'payment_link';
        lastError = '';
      } else {
        lastError = linkData.error?.description || lastError || 'Payment Link create failed';
      }
    } catch (err: any) {
      lastError = err.message || lastError || 'Payment Link API failed';
    }
  }

  if (!transactionId) {
    res.status(502).json({
      success: false,
      error: lastError || 'Failed to create Razorpay UPI QR',
    });
    return;
  }

  const qrPayload =
    payUrl ||
    `upi://pay?pa=${encodeURIComponent(process.env.RAZORPAY_UPI_VPA || 'kitchenasty@razorpay')}&pn=${encodeURIComponent(payee)}&am=${order.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(order.orderNumber)}`;

  const qrImageDataUrl =
    qrImageUrl ||
    (await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    }));

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: 'RAZORPAY',
      status: 'PENDING',
      amount: order.total,
      transactionId,
      metadata: {
        demo: false,
        provider: 'razorpay',
        mode,
        qrCodeId: mode === 'qr_code' ? transactionId : undefined,
        paymentLinkId: mode === 'payment_link' ? transactionId : undefined,
        payUrl,
        testMode: isTestKey,
      } satisfies Prisma.InputJsonValue,
    },
  });

  res.json({
    success: true,
    data: {
      paymentId: payment.id,
      transactionId,
      amount: order.total,
      currency: 'INR',
      qrPayload,
      qrImageDataUrl: qrImageUrl || qrImageDataUrl,
      qrImageUrl,
      payUrl,
      mode,
      demoMode: false,
      testMode: isTestKey,
      message:
        mode === 'payment_link'
          ? 'Scan QR to open Razorpay UPI pay (cards disabled).'
          : 'Scan this Razorpay UPI QR with PhonePe / GPay.',
    },
  });
}

/** Poll payment status — syncs from Razorpay API only (no timer auto-success). */
export async function getRazorpayPaymentStatus(req: Request, res: Response): Promise<void> {
  const paymentId = String(req.params.paymentId || '');
  if (!paymentId) {
    res.status(400).json({ success: false, error: 'paymentId is required' });
    return;
  }

  let payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    res.status(404).json({ success: false, error: 'Payment not found' });
    return;
  }

  // // Old demo lazy-complete — DO NOT auto-succeed
  // const meta = (payment.metadata || {}) as { demo?: boolean; autoCompleteMs?: number };
  // if (payment.status === 'PENDING' && meta.demo) {
  //   const waitMs = Number(meta.autoCompleteMs) || RAZORPAY_DEMO_AUTO_MS;
  //   const age = Date.now() - new Date(payment.createdAt).getTime();
  //   if (age >= Math.max(3000, waitMs)) {
  //     await completeRazorpayPayment(payment.id, payment.orderId);
  //     payment = (await prisma.payment.findUnique({ where: { id: paymentId } })) || payment;
  //   }
  // }

  if (payment.status === 'PENDING') {
    const synced = await syncRazorpayQrFromApi(payment);
    if (synced === 'COMPLETED') {
      payment = (await prisma.payment.findUnique({ where: { id: paymentId } })) || payment;
    }
  }

  res.json({
    success: true,
    data: {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      razorpayQrId: payment.transactionId,
    },
  });
}

/**
 * Simulate Razorpay TEST-mode QR payment (explicit call only — never auto).
 * Only works with rzp_test_* keys.
 */
export async function simulateRazorpayTestPayment(req: Request, res: Response): Promise<void> {
  const { orderId, paymentId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  if (!keyId.startsWith('rzp_test_')) {
    res.status(400).json({
      success: false,
      error: 'simulate-test-pay only works with Razorpay TEST keys (rzp_test_…). Use a real UPI scan in live mode.',
    });
    return;
  }

  const auth = getRazorpayAuthHeader();
  if (!auth) {
    res.status(503).json({ success: false, error: 'Razorpay keys not configured' });
    return;
  }

  const payment = paymentId
    ? await prisma.payment.findFirst({ where: { id: paymentId, orderId } })
    : await prisma.payment.findFirst({
        where: { orderId, method: 'RAZORPAY', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

  if (!payment?.transactionId) {
    res.status(404).json({ success: false, error: 'Pending Razorpay QR payment not found' });
    return;
  }

  try {
    const amountPaise = Math.round(payment.amount * 100);
    const simRes = await fetch('https://api.razorpay.com/v1/payments/qr_codes/pay/test', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_code_id: payment.transactionId,
        reference: payment.transactionId,
        amount: amountPaise,
        method: 'upi',
      }),
    });

    if (!simRes.ok) {
      const fallback = await fetch('https://api.razorpay.com/v1/bharatqr/pay/test', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: payment.transactionId,
          amount: amountPaise,
          method: 'upi',
        }),
      });
      const fbData = (await fallback.json()) as { error?: { description?: string } };
      if (!fallback.ok) {
        res.status(502).json({
          success: false,
          error:
            fbData.error?.description ||
            'Razorpay test simulate failed. Live mode: scan with PhonePe/GPay. Or complete via webhook after real payment.',
        });
        return;
      }
    }

    await syncRazorpayQrFromApi(payment);
    const result = await completeRazorpayPayment(payment.id, orderId);
    res.json({
      success: true,
      data: result || { status: 'PENDING', paymentId: payment.id },
      message: 'Test payment recorded. Storefront shows success when status is COMPLETED.',
    });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Test simulate failed' });
  }
}

/**
 * Internal confirm (tests). Prefer webhook / Razorpay poll / simulate-test-pay.
 */
export async function confirmRazorpayDemoPayment(req: Request, res: Response): Promise<void> {
  const { orderId, paymentId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  if (!keyId.startsWith('rzp_test_') && process.env.NODE_ENV === 'production') {
    res.status(403).json({ success: false, error: 'Manual confirm disabled' });
    return;
  }

  const payment = paymentId
    ? await prisma.payment.findFirst({ where: { id: paymentId, orderId } })
    : await prisma.payment.findFirst({
        where: { orderId, method: 'RAZORPAY', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

  if (!payment) {
    res.status(404).json({ success: false, error: 'Pending Razorpay payment not found' });
    return;
  }

  const result = await completeRazorpayPayment(payment.id, orderId);
  if (!result) {
    res.status(400).json({ success: false, error: 'Could not complete payment' });
    return;
  }

  res.json({ success: true, data: result });
}

/** Razorpay webhook: qr_code.credited → mark payment completed */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const event = req.body as {
    event?: string;
    payload?: {
      qr_code?: { entity?: { id?: string; notes?: { orderId?: string } } };
      payment?: { entity?: { id?: string } };
    };
  };

  if (event.event === 'qr_code.credited') {
    const qrId = event.payload?.qr_code?.entity?.id;
    const orderIdFromNotes = event.payload?.qr_code?.entity?.notes?.orderId;

    const payment = qrId
      ? await prisma.payment.findFirst({
          where: { transactionId: qrId, method: 'RAZORPAY', status: 'PENDING' },
        })
      : orderIdFromNotes
        ? await prisma.payment.findFirst({
            where: { orderId: orderIdFromNotes, method: 'RAZORPAY', status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    if (payment) {
      await completeRazorpayPayment(payment.id, payment.orderId);
    }
  }

  res.json({ success: true });
}

/** Customer chooses offline payment — notify staff; staff confirms via /cash. */
export async function requestOfflinePayment(req: Request, res: Response): Promise<void> {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ success: false, error: 'orderId is required' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const alreadyPaid = await prisma.payment.findFirst({
    where: { orderId, status: 'COMPLETED' },
  });
  if (alreadyPaid) {
    res.status(409).json({ success: false, error: 'Order already paid' });
    return;
  }

  let payment = await prisma.payment.findFirst({
    where: { orderId, method: 'CASH', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'CASH',
        status: 'PENDING',
        amount: order.total,
        metadata: { offlineRequest: true },
      },
    });
  }

  const { emitPaymentRequest } = await import('../lib/socket.js');
  emitPaymentRequest({
    orderId: order.id,
    orderNumber: order.orderNumber,
    method: 'CASH',
    amount: order.total,
  });

  res.status(201).json({
    success: true,
    data: {
      paymentId: payment.id,
      status: 'PENDING',
      message: 'Staff has been notified. Please wait for confirmation.',
    },
  });
}
