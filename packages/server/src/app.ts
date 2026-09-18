import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import locationRoutes from './routes/location.routes.js';
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import reservationRoutes from './routes/reservation.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import reviewRoutes from './routes/review.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import automationRoutes from './routes/automation.routes.js';
import loyaltyRoutes from './routes/loyalty.routes.js';
import legalRoutes from './routes/legal.routes.js';
import consentRoutes from './routes/consent.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import staffRoutes from './routes/staff.routes.js';
import developerRoutes from './routes/developer.routes.js';
import galleryRoutes from './routes/gallery.routes.js';
import mediaRoutes from './routes/media.routes.js';
import tableKioskRoutes from './routes/tableKiosk.routes.js';
import { openApiSpec } from './lib/openapi.js';
import { initPassport } from './lib/passport.js';
import passport from 'passport';
import logger from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { httpLogger } from './middleware/httpLogger.js';
import { metricsCollector } from './middleware/metricsCollector.js';

// Initialize automation event listeners
import './lib/events.js';

// Always load packages/server/.env (works from monorepo root or package cwd; CJS-safe)
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'packages/server/.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5176',
  'http://localhost:5177',
];

function isAllowedOrigin(origin: string): boolean {
  if (defaultAllowedOrigins.includes(origin)) {
    return true;
  }

  return /^http:\/\/localhost:\d+$/.test(origin);
}

export function createApp() {
  const app = express();

  // Middleware
  app.use(requestId);
  // cross-origin: storefront/admin (Vite) call this API from other localhost ports
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowlistedOrigins = configuredOrigins?.length ? configuredOrigins : defaultAllowedOrigins;
      if (allowlistedOrigins.includes(origin) || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }));
  if (process.env.NODE_ENV !== 'test') {
    app.use(httpLogger);
  }

  // Health check (before rate limiter so monitoring/readiness probes always work)
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  });

  // Rate limiting
  if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      // Higher in development for local testing (HMR / multi-tab); keep lower in production
      max: process.env.NODE_ENV === 'production' ? 200 : 2000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests, please try again later.' },
    });
    app.use('/api/', limiter);
  }

  // Stripe webhook needs raw body — register before JSON parser
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize passport for social login
  initPassport();
  app.use(passport.initialize());

  // Metrics collection (after passport so req.user is available)
  if (process.env.NODE_ENV !== 'test') {
    app.use(metricsCollector);
  }

  // Serve uploaded files
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // API Documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'KitchenAsty API Documentation',
  }));

  // OpenAPI spec endpoint
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/locations', locationRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/automation-rules', automationRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use('/api/legal', legalRoutes);
  app.use('/api/consent', consentRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/developer', developerRoutes);
  app.use('/api/gallery', galleryRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/table-kiosks', tableKioskRoutes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
    });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    });
  });

  return app;
}
