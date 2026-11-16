import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  /** Admin permission keys (empty for non-admins). */
  perms: string[];
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'royal-ride',
    audience: 'royal-ride-app',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'royal-ride',
    audience: 'royal-ride-app',
  }) as AccessClaims;
}
