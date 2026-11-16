import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from './errors.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/** MongoDB aborts one of two transactions that write the same document (write conflict → P2034). */
export function isWriteConflict(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return true;
  const msg = (e as Error)?.message ?? '';
  return /WriteConflict|write conflict|TransientTransactionError/i.test(msg);
}

/**
 * Run an interactive MongoDB transaction, retrying on write conflicts with jittered backoff.
 * Combined with `lockVehicle`, this serialises concurrent writers on the same vehicle.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
    } catch (e) {
      if (!isWriteConflict(e)) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 40 * (i + 1) + Math.random() * 60));
    }
  }
  throw new AppError(409, 'This vehicle is being booked by someone else right now. Please try again.', 'BUSY', { cause: String(last) });
}

/**
 * Claim the vehicle document for this transaction. Any other transaction touching the same
 * vehicle will now conflict, so the availability check that follows cannot race.
 */
export async function lockVehicle(tx: Tx, vehicleId: string) {
  await tx.vehicle.update({ where: { id: vehicleId }, data: { lockVersion: { increment: 1 } }, select: { id: true } });
}

/*
 * ── MongoDB null semantics (verified against Atlas) ──
 * 1. An optional field Prisma never wrote is *absent*; `{ field: null }` matches only explicit nulls.
 *    → use `nullish('field')` for "no value".
 * 2. Prisma evaluates range filters as aggregation expressions where null/absent sort below every
 *    value, so `{ field: { lte: date } }` MATCHES null/absent documents.
 *    → use `setAnd('field', { lte: date })` for lt/lte on nullable fields. (gt/gte are safe.)
 * Always put these inside an `AND: [...]` array so they never overwrite a sibling OR/AND key.
 */
export function nullish<K extends string>(field: K) {
  return { OR: [{ [field]: null }, { [field]: { isSet: false } }] as Record<K, null | { isSet: false }>[] };
}
export function setAnd<K extends string, C extends Record<string, unknown>>(field: K, cmp: C) {
  return { AND: [{ [field]: { ...cmp, not: null } }, { [field]: { isSet: true } }] as Record<K, C | { isSet: true }>[] };
}

/** Valid MongoDB ObjectId hex string (24 chars). Use before querying by id from user input. */
export const isObjectId = (s: unknown): s is string => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);
