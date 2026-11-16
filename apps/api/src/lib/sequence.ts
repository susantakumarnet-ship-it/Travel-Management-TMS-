import { prisma, type Tx } from './prisma.js';

type Seq = 'booking' | 'invoice' | 'wedding';

/**
 * Atomic per-year counter (findOneAndUpdate with $inc under the hood).
 * Deliberately runs outside the caller's transaction so unrelated bookings never
 * write-conflict on the counter document; a rolled-back booking just leaves a gap.
 */
async function next(seq: Seq): Promise<number> {
  const id = `${seq}-${new Date().getFullYear()}`;
  const row = await prisma.counter.upsert({ where: { id }, create: { id, seq: 1 }, update: { seq: { increment: 1 } } });
  return row.seq;
}
const year = () => new Date().getFullYear();

// `_tx` kept in the signature so call sites don't change.
export const nextBookingNumber = async (_tx?: Tx) => `RR-${year()}-${String(await next('booking')).padStart(6, '0')}`;
export const nextInvoiceNumber = async (_tx?: Tx) => `INV/${year()}/${String(await next('invoice')).padStart(6, '0')}`;
export const nextWeddingNumber = async (_tx?: Tx) => `WED-${year()}-${String(await next('wedding')).padStart(5, '0')}`;
