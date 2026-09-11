import { Router } from 'express';
import express from 'express';
import { optionalAuth, authenticate, requireStaff } from '../middleware/auth.js';
import {
  createPaymentIntent,
  createCheckoutSession,
  handleWebhook,
  markCashPayment,
  createPayPalPayment,
  capturePayPalPayment,
  // createRazorpayCheckoutOrder,
  // verifyRazorpayCheckout,
  createRazorpayDemoQr,
  confirmRazorpayDemoPayment,
  getRazorpayPaymentStatus,
  simulateRazorpayTestPayment,
  handleRazorpayWebhook,
  requestOfflinePayment,
} from '../controllers/payment.controller.js';

const router = Router();

// Stripe webhook needs raw body
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// --- Stripe (legacy) ---
router.post('/create-intent', optionalAuth, createPaymentIntent);
router.post('/create-checkout-session', optionalAuth, createCheckoutSession);

// Offline / cash — staff confirms paid → order COMPLETED
router.post('/cash', authenticate, requireStaff, markCashPayment);

// Customer requests offline payment (notify staff)
router.post('/offline-request', optionalAuth, requestOfflinePayment);

// // Unused: Razorpay Checkout.js (card modal) — storefront uses QR only
// router.post('/razorpay/create-order', optionalAuth, createRazorpayCheckoutOrder);
// router.post('/razorpay/verify', optionalAuth, verifyRazorpayCheckout);

// Razorpay UPI QR / payment-link flow
router.post('/razorpay/create-qr', optionalAuth, createRazorpayDemoQr);
router.get('/razorpay/status/:paymentId', optionalAuth, getRazorpayPaymentStatus);
router.post('/razorpay/simulate-test-pay', optionalAuth, simulateRazorpayTestPayment);
router.post('/razorpay/confirm-demo', optionalAuth, confirmRazorpayDemoPayment);
router.post('/razorpay/webhook', handleRazorpayWebhook);

// PayPal (legacy)
router.post('/paypal/create', optionalAuth, createPayPalPayment);
router.post('/paypal/capture', optionalAuth, capturePayPalPayment);

export default router;
