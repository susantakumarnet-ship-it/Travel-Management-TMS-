import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { UPLOAD_ROOT } from './integrations/storage.js';
import webhookRoutes from './modules/payments/routes.js';
import authRoutes from './modules/auth/routes.js';
import publicRoutes from './modules/public/routes.js';
import customerRoutes, { notificationRoutes } from './modules/customer/routes.js';
import ownerRoutes, { ownerFileRoute } from './modules/owner/routes.js';
import driverRoutes, { driverFileRoute } from './modules/driver/routes.js';
import adminRoutes from './modules/admin/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  app.use(cors({ origin: [env.APP_URL], credentials: true }));
  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' }, customLogLevel: (_q, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'silent') }));
  }

  app.get('/health', async (_req, res) => {
    await prisma.$runCommandRaw({ ping: 1 });
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Webhooks need the raw body → mounted before JSON parsing.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  // Public files only. Private documents are never served statically.
  app.use('/uploads/public', express.static(path.join(UPLOAD_ROOT, 'public'), { maxAge: '30d', immutable: true, fallthrough: false }));

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/me/notifications', notificationRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/owner/files', ownerFileRoute);
  app.use('/api/owner', ownerRoutes);
  app.use('/api/driver/files', driverFileRoute);
  app.use('/api/driver', driverRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
