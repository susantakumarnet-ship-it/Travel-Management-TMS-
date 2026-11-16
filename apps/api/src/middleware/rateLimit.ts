import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// DISABLE_RATE_LIMITS is for automated test runs only; config/env.ts refuses it in production.
const skip = () => env.NODE_ENV === 'test' || env.DISABLE_RATE_LIMITS;

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});

/** OTP sending: per IP. Per-phone limits are enforced in the auth service against the DB. */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Try again in a few minutes.' } },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});
