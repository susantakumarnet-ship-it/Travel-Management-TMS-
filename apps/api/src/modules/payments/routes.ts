import { Router, raw } from 'express';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';
import { handleWebhook } from './service.js';

/**
 * Gateway webhooks. Mounted BEFORE express.json() so we receive the exact raw bytes
 * the signature was computed over.
 */
const r = Router();
r.use(raw({ type: '*/*', limit: '1mb' }));

r.post('/razorpay', async (req, res) => {
  try {
    const out = await handleWebhook('RAZORPAY', req.body as Buffer, req.headers);
    res.json(out);
  } catch (e) {
    logger.warn({ err: e }, 'razorpay webhook rejected');
    if (e instanceof AppError && e.code === 'BAD_SIGNATURE') return res.status(400).json({ error: 'invalid signature' });
    throw e; // 5xx → gateway retries
  }
});

r.post('/cashfree', async (req, res) => {
  try {
    const out = await handleWebhook('CASHFREE', req.body as Buffer, req.headers);
    res.json(out);
  } catch (e) {
    logger.warn({ err: e }, 'cashfree webhook rejected');
    if (e instanceof AppError && e.code === 'BAD_SIGNATURE') return res.status(400).json({ error: 'invalid signature' });
    throw e;
  }
});

export default r;
