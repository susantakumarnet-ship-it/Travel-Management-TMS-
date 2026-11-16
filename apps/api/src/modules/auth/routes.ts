import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { body, zPhone } from '../../lib/validate.js';
import { isProd, env } from '../../config/env.js';
import { otpLimiter, loginLimiter } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';
import { unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { adminLogin, issueTokens, profileFor, requestOtp, revokeRefresh, rotateRefresh, verifyOtp } from './service.js';

const r = Router();
const COOKIE = 'rr_refresh';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

r.post('/otp/request', otpLimiter, async (req, res) => {
  const { phone } = body(req, z.object({ phone: zPhone }));
  res.json(await requestOtp(phone, req.ip));
});

r.post('/otp/verify', loginLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({
      phone: zPhone,
      code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
      name: z.string().trim().max(120).optional(),
      email: z.string().email().optional().or(z.literal('')),
      role: z.enum(['CUSTOMER', 'OWNER', 'DRIVER']).default('CUSTOMER'),
    }),
  );
  const { user, isNew } = await verifyOtp({ ...input, email: input.email || undefined });
  const tokens = await issueTokens(user, meta(req));
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ accessToken: tokens.accessToken, isNew, user: await profileFor(user.id) });
});

r.post('/admin/login', loginLimiter, async (req, res) => {
  const { email, password } = body(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  const user = await adminLogin(email, password);
  const tokens = await issueTokens(user, meta(req));
  setRefreshCookie(res, tokens.refreshToken);
  req.user = { id: user.id, role: user.role, perms: [] };
  await audit(req, 'auth.admin_login', 'User', user.id);
  res.json({ accessToken: tokens.accessToken, user: await profileFor(user.id) });
});

r.post('/refresh', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw unauthorized('No session');
  const out = await rotateRefresh(token, meta(req));
  setRefreshCookie(res, out.refreshToken);
  res.json({ accessToken: out.accessToken, user: await profileFor(out.user.id) });
});

r.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await revokeRefresh(token);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  res.json(await profileFor(req.user!.id));
});

export default r;
