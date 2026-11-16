import bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { prisma, nullish } from '../../lib/prisma.js';
import { env, isProd } from '../../config/env.js';
import { AppError, badRequest, unauthorized } from '../../lib/errors.js';
import { randomOtp, randomToken, safeEqual, sha256 } from '../../lib/util.js';
import { signAccessToken } from '../../lib/jwt.js';
import { sendOtpSms } from '../../integrations/sms.js';
import { notify } from '../notifications/service.js';

const otpHash = (phone: string, code: string) => sha256(`${phone}:${code}:${env.JWT_REFRESH_SECRET}`);

export async function requestOtp(phone: string, ip?: string) {
  const since = new Date(Date.now() - 15 * 60_000);
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  if (recent.length >= 5) throw new AppError(429, 'Too many OTP requests for this number. Try again in 15 minutes.', 'RATE_LIMITED');
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 30_000) {
    throw new AppError(429, 'Please wait 30 seconds before requesting another OTP.', 'RATE_LIMITED');
  }
  const user = await prisma.user.findUnique({ where: { phone }, select: { status: true } });
  if (user?.status === 'SUSPENDED') throw new AppError(403, 'This account is suspended. Please contact support.', 'SUSPENDED');

  const code = randomOtp();
  await prisma.otpCode.create({
    data: { phone, codeHash: otpHash(phone, code), expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000), ip },
  });
  const r = await sendOtpSms(phone, code);
  if (!r.ok) throw new AppError(502, 'Could not send OTP. Please try again.', 'SMS_FAILED');
  return {
    sent: true,
    expiresIn: env.OTP_TTL_SECONDS,
    isNewUser: !user,
    // Surface the code only in non-production console mode so local testing works without SMS.
    ...(!isProd && env.SMS_DRIVER === 'console' ? { devOtp: env.DEV_FIXED_OTP || code } : {}),
  };
}

async function consumeOtp(phone: string, code: string) {
  if (!isProd && env.DEV_FIXED_OTP && safeEqual(code, env.DEV_FIXED_OTP)) {
    await prisma.otpCode.updateMany({ where: { phone, AND: [nullish('consumedAt')] }, data: { consumedAt: new Date() } });
    return;
  }
  const otp = await prisma.otpCode.findFirst({
    where: { phone, AND: [nullish('consumedAt')], expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw badRequest('OTP expired. Please request a new one.');
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, 'Too many wrong attempts. Request a new OTP.', 'RATE_LIMITED');
  if (!safeEqual(otp.codeHash, otpHash(phone, code))) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw badRequest('Incorrect OTP');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
}

export async function verifyOtp(input: { phone: string; code: string; name?: string; email?: string; role: 'CUSTOMER' | 'OWNER' | 'DRIVER' }) {
  await consumeOtp(input.phone, input.code);
  let user = await prisma.user.findUnique({ where: { phone: input.phone } });
  let isNew = false;

  if (!user) {
    isNew = true;
    user = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.name?.trim() || null,
        email: input.email?.toLowerCase() || null,
        role: input.role,
        status: input.role === 'CUSTOMER' ? 'ACTIVE' : 'PENDING',
        ...(input.role === 'CUSTOMER' ? { customerProfile: { create: {} } } : {}),
      },
    });
    if (input.role === 'CUSTOMER') {
      void notify({ userId: user.id, phone: user.phone, email: user.email }, 'CUSTOMER_REGISTERED', { name: user.name ?? 'there' });
    }
  } else if (user.role !== input.role) {
    // Allow a fresh customer account (no bookings) to become a partner; otherwise roles are exclusive per number.
    const bookings = await prisma.booking.count({ where: { customerId: user.id } });
    if (user.role === 'CUSTOMER' && input.role !== 'CUSTOMER' && bookings === 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: input.role, status: 'PENDING' } });
    } else if (user.role === 'ADMIN') {
      throw badRequest('Admins must sign in at the admin login page');
    } else if (input.role !== 'CUSTOMER') {
      throw badRequest(`This number is already registered as a ${user.role.toLowerCase()}. Please use a different number.`);
    }
    // A partner signing in from the customer page just gets their own portal.
  }
  if (user.status === 'SUSPENDED') throw new AppError(403, 'This account is suspended. Please contact support.', 'SUSPENDED');
  return { user, isNew };
}

export async function adminLogin(email: string, password: string) {
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
  // Constant-ish time: always run bcrypt.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinval');
  if (!user || !ok || user.role !== 'ADMIN') throw unauthorized('Invalid email or password');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account disabled', 'SUSPENDED');
  return user;
}

export async function issueTokens(user: User, meta: { ip?: string; userAgent?: string }) {
  let perms: string[] = [];
  if (user.role === 'ADMIN' && user.adminRoleId) {
    const role = await prisma.adminRole.findUnique({ where: { id: user.adminRoleId } });
    perms = role?.permissions ?? [];
  }
  const accessToken = signAccessToken({ sub: user.id, role: user.role, perms });
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { accessToken, refreshToken };
}

/** Rotate a refresh token. Reuse of a revoked token revokes every session for that user. */
export async function rotateRefresh(token: string, meta: { ip?: string; userAgent?: string }) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row) throw unauthorized('Session expired');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: row.userId, AND: [nullish('revokedAt')] }, data: { revokedAt: new Date() } });
    throw unauthorized('Session expired');
  }
  if (row.expiresAt < new Date() || row.user.status === 'SUSPENDED') throw unauthorized('Session expired');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const tokens = await issueTokens(row.user, meta);
  return { ...tokens, user: row.user };
}

export async function revokeRefresh(token: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), AND: [nullish('revokedAt')] }, data: { revokedAt: new Date() } });
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function profileFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      customerProfile: true,
      owner: { select: { id: true, businessName: true, kycStatus: true } },
      driver: { select: { id: true, verificationStatus: true, isAvailable: true } },
      adminRole: { select: { name: true, permissions: true } },
    },
  });
  const { passwordHash: _pw, ...safe } = user;
  void _pw;
  return safe;
}

export type PublicRole = Exclude<Role, 'ADMIN'>;
