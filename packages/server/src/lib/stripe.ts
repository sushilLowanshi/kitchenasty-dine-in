import Stripe from 'stripe';
import prisma from './db.js';

let cachedStripe: Stripe | null = null;
let cachedKey: string = '';

function isPlaceholderStripeKey(secretKey: string): boolean {
  const normalized = secretKey.trim();
  return !normalized || normalized === 'sk_test_placeholder' || normalized === 'sk_test_...';
}

export async function getStripeSecretKey(): Promise<string> {
  let secretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const payment = (settings?.paymentSettings as Record<string, any>) || {};
    if (payment.stripeSecretKey) {
      secretKey = payment.stripeSecretKey;
    }
  } catch {
    // DB unavailable — fall back to env var
  }

  return secretKey;
}

export async function ensureStripeConfigured(): Promise<string> {
  const secretKey = await getStripeSecretKey();
  if (isPlaceholderStripeKey(secretKey)) {
    throw new Error('Stripe is not configured. Set a real STRIPE_SECRET_KEY or save one in site settings.');
  }

  return secretKey;
}

export async function getStripe(): Promise<Stripe> {
  const secretKey = await ensureStripeConfigured();

  if (cachedStripe && cachedKey === secretKey) {
    return cachedStripe;
  }

  cachedStripe = new Stripe(secretKey, {
    apiVersion: '2026-02-25.clover',
  });
  cachedKey = secretKey;

  return cachedStripe;
}

// Default export for backwards compatibility
export default new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-02-25.clover',
});
