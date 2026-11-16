import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  role: Role;
  perms: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

function readToken(req: Request): string | null {
  const h = req.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const t = readToken(req);
  if (t) {
    try {
      const c = verifyAccessToken(t);
      req.user = { id: c.sub, role: c.role, perms: c.perms ?? [] };
    } catch {
      /* ignore */
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const t = readToken(req);
  if (!t) return next(unauthorized());
  try {
    const c = verifyAccessToken(t);
    req.user = { id: c.sub, role: c.role, perms: c.perms ?? [] };
    next();
  } catch {
    next(unauthorized('Session expired. Please sign in again.'));
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Permission keys follow "<module>:<read|write>". "*" is super-admin. "<module>:write" implies read. */
export function hasPermission(user: AuthUser | undefined, perm: string): boolean {
  if (!user || user.role !== 'ADMIN') return false;
  if (user.perms.includes('*')) return true;
  if (user.perms.includes(perm)) return true;
  const [mod, action] = perm.split(':');
  return action === 'read' && user.perms.includes(`${mod}:write`);
}

export const requirePermission =
  (perm: string) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!hasPermission(req.user, perm)) return next(forbidden());
    next();
  };

export const ADMIN_MODULES = [
  'dashboard',
  'customers',
  'vehicles',
  'categories',
  'owners',
  'drivers',
  'bookings',
  'weddings',
  'packages',
  'payments',
  'refunds',
  'commissions',
  'coupons',
  'reviews',
  'notifications',
  'reports',
  'content',
  'settings',
  'roles',
  'audit',
] as const;
