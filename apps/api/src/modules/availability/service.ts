import type { Prisma } from '@prisma/client';
import { prisma, withTx, nullish, setAnd, type Tx } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';
import { addMinutes } from '../../lib/util.js';
import { logger } from '../../lib/logger.js';

/**
 * Availability model
 * ------------------
 * Every booking/maintenance/owner block is a row in vehicle_availability covering
 * [startAt, endAt) where endAt already includes the turnaround buffer.
 * Rows are "live" when active = true AND (holdExpiresAt IS NULL OR holdExpiresAt > now()).
 * Every writer first bumps vehicles.lockVersion inside a MongoDB transaction (lockVehicle),
 * so concurrent writers on one vehicle write-conflict and are retried one at a time; the overlap
 * check below therefore always sees committed bookings and two overlapping holds cannot both commit.
 */

export function liveBlockWhere(start: Date, end: Date, now = new Date()): Prisma.VehicleAvailabilityWhereInput {
  return {
    active: true,
    startAt: { lt: end },
    endAt: { gt: start },
    OR: [...nullish('holdExpiresAt').OR, { holdExpiresAt: { gt: now } }],
  };
}

export async function blockWindow(pickupAt: Date, returnAt: Date) {
  const buffer = (await getSettings())['booking.bufferMinutes'];
  return { startAt: pickupAt, endAt: addMinutes(returnAt, buffer) };
}

export async function findConflicts(vehicleId: string, start: Date, end: Date, db: Tx | typeof prisma = prisma) {
  return db.vehicleAvailability.findMany({
    where: { vehicleId, ...liveBlockWhere(start, end) },
    select: { id: true, type: true, startAt: true, endAt: true, bookingId: true },
  });
}

export async function isVehicleAvailable(vehicleId: string, pickupAt: Date, returnAt: Date, db: Tx | typeof prisma = prisma) {
  const w = await blockWindow(pickupAt, returnAt);
  return (await findConflicts(vehicleId, w.startAt, w.endAt, db)).length === 0;
}

/**
 * Deactivate unpaid holds that have lapsed and cancel their bookings.
 * Called by the scheduler every minute and inline before creating a booking for a vehicle,
 * so a slot whose hold has already expired is never treated as taken.
 */
export async function releaseExpiredHolds(tx: Tx, vehicleId?: string): Promise<number> {
  const now = new Date();
  const expired = await tx.vehicleAvailability.findMany({
    where: { active: true, AND: [setAnd('holdExpiresAt', { lte: now })], ...(vehicleId ? { vehicleId } : {}) },
    select: { id: true, bookingId: true },
  });
  if (!expired.length) return 0;
  await tx.vehicleAvailability.updateMany({ where: { id: { in: expired.map((e) => e.id) } }, data: { active: false } });
  const bookingIds = expired.map((e) => e.bookingId).filter((x): x is string => !!x);
  if (bookingIds.length) {
    const toCancel = await tx.booking.findMany({
      where: { id: { in: bookingIds }, status: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
      select: { id: true, status: true },
    });
    for (const b of toCancel) {
      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: 'Payment not completed in time' },
      });
      await tx.bookingStatusHistory.create({
        data: { bookingId: b.id, fromStatus: b.status, toStatus: 'CANCELLED', note: 'Hold expired: advance payment not received' },
      });
    }
  }
  return expired.length;
}

export async function releaseAllExpiredHolds() {
  const n = await withTx((tx) => releaseExpiredHolds(tx));
  if (n) logger.info(`Released ${n} expired booking hold(s)`);
}

/** Calendar for a vehicle: blocked ranges in a window (for the details-page date picker). */
export async function vehicleCalendar(vehicleId: string, from: Date, to: Date) {
  const rows = await prisma.vehicleAvailability.findMany({
    where: { vehicleId, ...liveBlockWhere(from, to) },
    select: { startAt: true, endAt: true, type: true },
    orderBy: { startAt: 'asc' },
  });
  return rows.map((r) => ({ start: r.startAt, end: r.endAt, type: r.type === 'BOOKING' ? 'booked' : 'unavailable' }));
}
