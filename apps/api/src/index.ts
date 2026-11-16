import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startScheduler } from './jobs/scheduler.js';
import { gatewayConfigured } from './integrations/payments.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Royal Ride API listening on http://localhost:${env.PORT}`);
  const gw = env.PAYMENT_GATEWAY;
  if (!gatewayConfigured(gw)) {
    logger.warn(
      env.ALLOW_TEST_GATEWAY
        ? `No ${gw} keys configured — using the DEVELOPMENT test gateway. Configure keys before going live.`
        : `No ${gw} keys configured — online payments are disabled.`,
    );
  }
  if (process.env.DISABLE_SCHEDULER !== 'true') startScheduler();
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (e) => logger.error({ err: e }, 'unhandledRejection'));
