import type { Booking, BookingStatus, Prisma, TravelPurpose, TripType } from '@prisma/client';
import { prisma, withTx, lockVehicle, type Tx } from '../../lib/prisma.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { getSettings } from '../../lib/settings.js';
import { nextBookingNumber } from '../../lib/sequence.js';
import { addMinutes, formatINR, formatIst, num, round2 } from '../../lib/util.js';
import { blockWindow, findConflicts, releaseExpiredHolds } from '../availability/service.js';
import { quoteForVehicle } from '../pricing/service.js';
import { refundPercentFor, type Quote } from '../pricing/engine.js';
import { notify } from '../notifications/service.js';
import { canTransition, ACTIVE_STATUSES, CANCELLABLE_BY_CUSTOMER } from './stateMachine.js';
import type { AuthUser } from '../../middleware/auth.js';

export interface CreateBookingInput {
  vehicleId: string;
  purpose: TravelPurpose;
  tripType: TripType;
  withDriver: boolean;
  pickupAt: Date;
  returnAt: Date;
  pickupAddress: string;
  dropAddress?: string;
  stops?: string[];
  estimatedKm: number;
  passengers: number;
  luggageBags: number;
  acRequired: boolean;
  decoration: boolean;
  destinationState?: string;
  estimatedTolls?: number;
  specialRequests?: string;
  couponCode?: string;
  passengerList?: { name: string; phone?: string; age?: number }[];
  weddingRequestId?: string;
  travelPackageId?: string;
}

export async function recordStatus(tx: Tx, bookingId: string, from: BookingStatus | null, to: BookingStatus, actorId?: string | null, note?: string) {
  await tx.bookingStatusHistory.create({ data: { bookingId, fromStatus: from, toStatus: to, actorId: actorId ?? null, note } });
}

export async function transition(tx: Tx, booking: Pick<Booking, 'id' | 'status'>, to: BookingStatus, actorId?: string | null, note?: string, data: Prisma.BookingUncheckedUpdateManyInput = {}) {
  if (!canTransition(booking.status, to)) {
    throw conflict(`Booking cannot move from ${booking.status} to ${to}`);
  }
  // Optimistic concurrency: only update if status is still what we read.
  const r = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { ...data, status: to } });
  if (r.count === 0) throw conflict('Booking was updated by someone else. Please refresh and try again.');
  await recordStatus(tx, booking.id, booking.status, to, actorId, note);
}

async function commissionRateFor(tx: Tx, ownerId: string, categoryId: string): Promise<number> {
  const [owner, cat, s] = await Promise.all([
    tx.vehicleOwner.findUnique({ where: { id: ownerId }, select: { commissionRate: true } }),
    tx.vehicleCategory.findUnique({ where: { id: categoryId }, select: { commissionRate: true } }),
    getSettings(),
  ]);
  return num(owner?.commissionRate ?? cat?.commissionRate ?? s['commission.defaultPercent']);
}

export const bookingInclude = {
  vehicle: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 3 }, category: true, model: true, city: true } },
  owner: { select: { id: true, businessName: true, user: { select: { phone: true, name: true } } } },
  driver: { select: { id: true, ratingAvg: true, licenceNumber: true, user: { select: { name: true, phone: true, avatarUrl: true } } } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  locations: { orderBy: { sequence: 'asc' } },
  passengersList: true,
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
  invoices: { orderBy: { issuedAt: 'desc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
  review: true,
  assignments: { orderBy: { assignedAt: 'desc' }, include: { driver: { select: { user: { select: { name: true, phone: true } } } } } },
} satisfies Prisma.BookingInclude;

// ───────────────────────────── Create ─────────────────────────────

export async function createBooking(user: AuthUser, input: CreateBookingInput) {
  const settings = await getSettings();
  const now = new Date();
  const leadMs = settings['booking.minLeadHours'] * 3_600_000;
  if (input.pickupAt.getTime() < now.getTime() + leadMs) {
    throw badRequest(`Pickup must be at least ${settings['booking.minLeadHours']} hours from now`);
  }
  if (input.returnAt <= input.pickupAt) throw badRequest('Return time must be after pickup time');
  if (input.returnAt.getTime() - input.pickupAt.getTime() > 60 * 86_400_000) throw badRequest('Bookings longer than 60 days need a custom quote');

  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, include: { owner: true, model: true } });
  if (!vehicle || vehicle.status !== 'ACTIVE') throw notFound('Vehicle');
  if (vehicle.owner.kycStatus !== 'APPROVED') throw badRequest('This vehicle is not accepting bookings right now');
  if (input.passengers > vehicle.seats) throw badRequest(`This vehicle seats up to ${vehicle.seats} passengers`);
  if (input.withDriver && vehicle.driverOption === 'SELF_DRIVE') throw badRequest('This vehicle is available for self-drive only');
  if (!input.withDriver && vehicle.driverOption === 'WITH_DRIVER') throw badRequest('This vehicle is only available with a driver');
  if (input.acRequired && !vehicle.hasAc) throw badRequest('This vehicle does not have AC');
  if (input.decoration && !vehicle.decorationAvailable) throw badRequest('Decoration is not available for this vehicle');
  for (const [label, d] of [['insurance', vehicle.insuranceExpiry], ['fitness certificate', vehicle.fitnessExpiry], ['pollution certificate', vehicle.pollutionExpiry]] as const) {
    if (d && d < input.returnAt) throw badRequest(`This vehicle's ${label} expires before your trip ends. Please choose another vehicle.`);
  }

  const window = await blockWindow(input.pickupAt, input.returnAt);
  const holdMinutes = settings['booking.holdMinutes'];

  const booking = await withTx(
    async (tx) => {
      // Serialise all booking attempts for this vehicle.
      await lockVehicle(tx, vehicle.id);
      await releaseExpiredHolds(tx, vehicle.id);
      const conflicts = await findConflicts(vehicle.id, window.startAt, window.endAt, tx);
      if (conflicts.length) {
        throw new AppError(409, 'This vehicle is not available for the selected dates. Please choose different dates or another vehicle.', 'VEHICLE_UNAVAILABLE');
      }

      const { quote, coupon } = await quoteForVehicle(
        vehicle,
        {
          tripType: input.tripType,
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
          estimatedKm: input.estimatedKm,
          withDriver: input.withDriver,
          decoration: input.decoration,
          destinationState: input.destinationState,
          estimatedTolls: input.estimatedTolls,
          purpose: input.purpose,
          couponCode: input.couponCode,
        },
        user.id,
        tx,
      );

      const rate = await commissionRateFor(tx, vehicle.ownerId, vehicle.categoryId);
      const commission = round2((quote.taxable * rate) / 100);
      const bookingNumber = await nextBookingNumber(tx);

      const b = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: user.id,
          vehicleId: vehicle.id,
          ownerId: vehicle.ownerId,
          weddingRequestId: input.weddingRequestId,
          travelPackageId: input.travelPackageId,
          couponId: coupon?.id,
          purpose: input.purpose,
          tripType: quote.tripType,
          withDriver: input.withDriver,
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
          pickupAddress: input.pickupAddress,
          dropAddress: input.dropAddress,
          estimatedKm: input.estimatedKm,
          passengers: input.passengers,
          luggageBags: input.luggageBags,
          acRequired: input.acRequired,
          decorationRequired: input.decoration,
          specialRequests: input.specialRequests,
          status: 'AWAITING_PAYMENT',
          ownerDecision: settings['booking.ownerAutoAccept'] ? 'ACCEPTED' : 'PENDING',
          ownerDecisionAt: settings['booking.ownerAutoAccept'] ? now : null,
          priceBreakdown: quote as unknown as Prisma.InputJsonValue,
          subtotal: quote.subtotal,
          discountAmount: quote.discount,
          taxAmount: quote.gst,
          totalAmount: quote.total,
          advanceAmount: quote.advance,
          securityDeposit: quote.securityDeposit,
          commissionRate: rate,
          commissionAmount: commission,
          ownerPayout: round2(quote.taxable - commission + quote.passThrough),
          locations: {
            create: [
              { type: 'PICKUP', sequence: 0, address: input.pickupAddress, scheduledAt: input.pickupAt },
              ...(input.stops ?? []).map((address, i) => ({ type: 'STOP' as const, sequence: i + 1, address })),
              ...(input.dropAddress ? [{ type: 'DROP' as const, sequence: (input.stops?.length ?? 0) + 1, address: input.dropAddress }] : []),
            ],
          },
          passengersList: input.passengerList?.length
            ? { create: input.passengerList.map((p, i) => ({ ...p, isPrimary: i === 0 })) }
            : undefined,
        },
      });

      await tx.vehicleAvailability.create({
        data: {
          vehicleId: vehicle.id,
          bookingId: b.id,
          type: 'BOOKING',
          startAt: window.startAt,
          endAt: window.endAt,
          holdExpiresAt: addMinutes(now, holdMinutes),
          reason: `Booking ${bookingNumber}`,
        },
      });
      await recordStatus(tx, b.id, null, 'AWAITING_PAYMENT', user.id, 'Booking created; awaiting advance payment');
      return b;
    },

  );

  const customer = await prisma.user.findUnique({ where: { id: user.id } });
  void notify({ userId: user.id, email: customer?.email }, 'BOOKING_CREATED', {
    bookingNumber: booking.bookingNumber,
    vehicle: vehicle.title,
    pickupAt: formatIst(booking.pickupAt),
    advance: formatINR(num(booking.advanceAmount)),
    holdMinutes,
  });
  return booking;
}

// ───────────────────────────── Access helpers ─────────────────────────────

export async function getBookingForUser(id: string, user: AuthUser) {
  const b = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!b) throw notFound('Booking');
  if (user.role === 'ADMIN') return b;
  if (user.role === 'CUSTOMER' && b.customerId === user.id) return b;
  if (user.role === 'OWNER') {
    const owner = await prisma.vehicleOwner.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (owner?.id === b.ownerId) return b;
  }
  if (user.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (driver && (b.driverId === driver.id || b.assignments.some((a) => a.driverId === driver.id && a.status !== 'CANCELLED'))) return b;
  }
  throw forbidden();
}

// ───────────────────────────── Confirmation (after payment) ─────────────────────────────

/** Called inside the payment-capture transaction. Returns true if the booking became CONFIRMED. */
export async function confirmAfterPayment(tx: Tx, bookingId: string): Promise<{ confirmed: boolean; needsRefund: boolean }> {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { availability: true, vehicle: true } });
  if (b.status !== 'AWAITING_PAYMENT' && b.status !== 'PENDING' && b.status !== 'CANCELLED') {
    return { confirmed: false, needsRefund: false };
  }
  if (b.status === 'CANCELLED') {
    // Payment arrived after the hold lapsed: try to re-reserve the slot, otherwise refund.
    if (b.cancelledById || b.cancellationReason !== 'Payment not completed in time') return { confirmed: false, needsRefund: true };
    await lockVehicle(tx, b.vehicleId);
    const w = await blockWindow(b.pickupAt, b.returnAt);
    const clash = (await findConflicts(b.vehicleId, w.startAt, w.endAt, tx)).filter((c) => c.bookingId !== b.id);
    if (clash.length) return { confirmed: false, needsRefund: true };
    await tx.booking.update({ where: { id: b.id }, data: { cancelledAt: null, cancellationReason: null } });
  }
  if (b.availability.length) {
    await tx.vehicleAvailability.updateMany({ where: { bookingId: b.id }, data: { active: true, holdExpiresAt: null } });
  }
  await transition(tx, b, 'CONFIRMED', null, 'Advance payment received');

  if (b.couponId) {
    const exists = await tx.couponRedemption.findUnique({ where: { bookingId: b.id } });
    if (!exists) {
      await tx.couponRedemption.create({ data: { couponId: b.couponId, userId: b.customerId, bookingId: b.id, amount: b.discountAmount } });
      await tx.coupon.update({ where: { id: b.couponId }, data: { usedCount: { increment: 1 } } });
    }
  }

  // Auto-assign the vehicle's default driver when free.
  if (b.withDriver && b.vehicle.defaultDriverId) {
    const free = await driverIsFree(tx, b.vehicle.defaultDriverId, b.pickupAt, b.returnAt, b.id);
    const d = await tx.driver.findUnique({ where: { id: b.vehicle.defaultDriverId } });
    if (free && d?.verificationStatus === 'APPROVED') {
      await createAssignment(tx, { ...b, status: 'CONFIRMED' }, d.id, null, 'Auto-assigned default driver');
    }
  }
  return { confirmed: true, needsRefund: false };
}

export async function afterConfirmedNotifications(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!b) return;
  const vars = {
    bookingId: b.id,
    bookingNumber: b.bookingNumber,
    vehicle: b.vehicle.title,
    registration: b.vehicle.registrationNumber,
    pickupAt: formatIst(b.pickupAt),
    pickup: b.pickupAddress,
    drop: b.dropAddress ?? '—',
    paid: formatINR(num(b.paidAmount)),
    balance: formatINR(Math.max(0, num(b.totalAmount) - num(b.paidAmount))),
    customerName: b.customer.name ?? 'Customer',
  };
  await notify({ userId: b.customerId, phone: b.customer.phone, email: b.customer.email }, 'BOOKING_CONFIRMED', vars);
  const ownerUser = await prisma.vehicleOwner.findUnique({ where: { id: b.ownerId }, include: { user: true } });
  if (ownerUser) await notify({ userId: ownerUser.userId, phone: ownerUser.user.phone, email: ownerUser.user.email }, 'OWNER_NEW_BOOKING', vars);
  if (b.driver) await notifyDriverAssigned(b.id);
}

// ───────────────────────────── Drivers ─────────────────────────────

export async function driverIsFree(tx: Tx | typeof prisma, driverId: string, from: Date, to: Date, excludeBookingId?: string) {
  const clash = await tx.booking.count({
    where: {
      driverId,
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      status: { in: ACTIVE_STATUSES },
      pickupAt: { lt: to },
      returnAt: { gt: from },
    },
  });
  return clash === 0;
}

async function createAssignment(tx: Tx, b: Pick<Booking, 'id' | 'status' | 'pickupAt' | 'returnAt'>, driverId: string, actorId: string | null, note?: string) {
  const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId } });
  const days = Math.max(1, Math.ceil((b.returnAt.getTime() - b.pickupAt.getTime()) / 86_400_000));
  await tx.driverAssignment.updateMany({ where: { bookingId: b.id, status: { in: ['ASSIGNED', 'ACCEPTED'] } }, data: { status: 'CANCELLED' } });
  await tx.driverAssignment.create({
    data: { bookingId: b.id, driverId, assignedById: actorId, note, driverEarning: round2(num(driver.dailyWage) * days) },
  });
  await transition(tx, b, 'DRIVER_ASSIGNED', actorId, note ?? 'Driver assigned', { driverId });
}

export async function assignDriver(bookingId: string, driverId: string, actor: AuthUser, ownerId?: string) {
  await withTx(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw notFound('Booking');
    if (ownerId && b.ownerId !== ownerId) throw forbidden();
    if (!b.withDriver) throw badRequest('This is a self-drive booking');
    if (!['CONFIRMED', 'DRIVER_ASSIGNED'].includes(b.status)) throw conflict('A driver can only be assigned to a confirmed booking');
    const d = await tx.driver.findUnique({ where: { id: driverId }, include: { user: true } });
    if (!d || d.verificationStatus !== 'APPROVED' || d.user.status !== 'ACTIVE') throw badRequest('Driver is not verified');
    if (ownerId && d.ownerId && d.ownerId !== ownerId) throw forbidden('This driver does not belong to your fleet');
    if (d.licenceExpiry < b.returnAt) throw badRequest("Driver's licence expires before this trip ends");
    if (!(await driverIsFree(tx, driverId, b.pickupAt, b.returnAt, b.id))) throw conflict('Driver already has a trip at this time');
    await createAssignment(tx, b, driverId, actor.id);
  });
  await notifyDriverAssigned(bookingId);
}

async function notifyDriverAssigned(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!b?.driver) return;
  const vars = {
    bookingId: b.id,
    bookingNumber: b.bookingNumber,
    driverName: b.driver.user.name ?? 'Driver',
    driverPhone: b.driver.user.phone,
    vehicle: b.vehicle.title,
    registration: b.vehicle.registrationNumber,
    pickupAt: formatIst(b.pickupAt),
    pickup: b.pickupAddress,
    drop: b.dropAddress ?? '—',
    customerName: b.customer.name ?? 'Customer',
  };
  await notify({ userId: b.customerId, phone: b.customer.phone }, 'DRIVER_ASSIGNED', vars);
  const drv = await prisma.driver.findUnique({ where: { id: b.driver.id }, select: { userId: true } });
  await notify({ userId: drv?.userId, phone: b.driver.user.phone }, 'DRIVER_NEW_TRIP', vars);
}

export async function driverRespond(bookingId: string, driverUserId: string, accept: boolean, note?: string) {
  const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
  if (!driver) throw forbidden();
  await withTx(async (tx) => {
    const a = await tx.driverAssignment.findFirst({ where: { bookingId, driverId: driver.id, status: 'ASSIGNED' } });
    if (!a) throw notFound('Pending assignment');
    await tx.driverAssignment.update({ where: { id: a.id }, data: { status: accept ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date(), note } });
    if (!accept) {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      await transition(tx, b, 'CONFIRMED', driverUserId, `Driver declined${note ? `: ${note}` : ''}`, { driverId: null });
    } else {
      await recordStatus(tx, bookingId, 'DRIVER_ASSIGNED', 'DRIVER_ASSIGNED', driverUserId, 'Driver accepted the trip');
    }
  });
  if (!accept) {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { owner: { include: { user: true } } } });
    if (b) {
      await notify({ userId: b.owner.userId, phone: b.owner.user.phone }, 'ADMIN_ALERT', { title: `Driver declined ${b.bookingNumber}`, message: `Please assign another driver for ${b.bookingNumber}.` }, ['IN_APP']);
    }
  }
}

// ───────────────────────────── Trip lifecycle ─────────────────────────────

export async function dispatchVehicle(bookingId: string, actor: AuthUser) {
  const b = await withTx(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await transition(tx, b, 'VEHICLE_DISPATCHED', actor.id, 'Vehicle dispatched to pickup');
    return b;
  });
  const full = await prisma.booking.findUniqueOrThrow({ where: { id: b.id }, include: bookingInclude });
  await notify({ userId: full.customerId, phone: full.customer.phone }, 'VEHICLE_DISPATCHED', {
    bookingNumber: full.bookingNumber,
    vehicle: full.vehicle.title,
    registration: full.vehicle.registrationNumber,
    driverName: full.driver?.user.name ?? '',
    driverPhone: full.driver?.user.phone ?? '',
  });
}

export async function startTrip(bookingId: string, actor: AuthUser, startOdometer: number) {
  const b = await withTx(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (num(b.paidAmount) <= 0) throw badRequest('Advance payment has not been received');
    if (Date.now() < b.pickupAt.getTime() - 3 * 3_600_000) throw badRequest('Trip can be started at most 3 hours before pickup time');
    await transition(tx, b, 'TRIP_STARTED', actor.id, `Trip started (odometer ${startOdometer} km)`, { startOdometer, startedAt: new Date() });
    return b;
  });
  await notify({ userId: b.customerId }, 'TRIP_STARTED', { bookingNumber: b.bookingNumber }, ['IN_APP']);
}

export interface CompleteTripInput {
  endOdometer: number;
  tolls: number;
  parking: number;
  stateTax?: number;
  notes?: string;
}

/** Final bill: original taxable + extra km + extra hours (taxed) + actual tolls/parking/state tax (untaxed). */
export function computeFinalBill(
  b: Pick<Booking, 'pickupAt' | 'returnAt' | 'tripType' | 'startOdometer' | 'startedAt'>,
  quote: Quote,
  rates: { perKmRate: number; extraKmRate: number; extraHourRate: number },
  input: CompleteTripInput,
  completedAt: Date,
) {
  const actualKm = Math.max(0, input.endOdometer - (b.startOdometer ?? input.endOdometer));
  const coveredKm = b.tripType === 'OUTSTATION' || b.tripType === 'AIRPORT_TRANSFER' ? quote.billedKm : quote.includedKm + quote.extraKm;
  const extraKm = Math.max(0, actualKm - coveredKm);
  const kmRate = b.tripType === 'OUTSTATION' ? rates.perKmRate : rates.extraKmRate;
  const extraKmCharge = round2(extraKm * kmRate);
  const bookedMs = b.returnAt.getTime() - b.pickupAt.getTime();
  const actualMs = completedAt.getTime() - (b.startedAt ?? b.pickupAt).getTime();
  const overMs = actualMs - bookedMs;
  const extraHours = overMs > 30 * 60_000 ? Math.ceil(overMs / 3_600_000) : 0; // 30-minute grace
  const extraHourCharge = round2(extraHours * rates.extraHourRate);
  const quotedStateTax = quote.lines.filter((l) => l.code === 'STATE_TAX').reduce((a, l) => a + l.amount, 0);
  const stateTax = input.stateTax ?? quotedStateTax;
  const taxable = round2(quote.taxable + extraKmCharge + extraHourCharge);
  const gst = round2((taxable * quote.gstPercent) / 100);
  const passThrough = round2(input.tolls + input.parking + stateTax);
  const total = round2(taxable + gst + passThrough);
  return {
    actualKm,
    coveredKm,
    extraKm,
    extraKmCharge,
    extraHours,
    extraHourCharge,
    tolls: input.tolls,
    parking: input.parking,
    stateTax,
    taxable,
    gst,
    passThrough,
    total,
  };
}

export async function completeTrip(bookingId: string, actor: AuthUser, input: CompleteTripInput) {
  const completedAt = new Date();
  const result = await withTx(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { vehicle: true } });
    if (b.startOdometer != null && input.endOdometer < b.startOdometer) throw badRequest('End odometer cannot be less than start odometer');
    const quote = b.priceBreakdown as unknown as Quote;
    const bill = computeFinalBill(b, quote, { perKmRate: num(b.vehicle.perKmRate), extraKmRate: num(b.vehicle.extraKmRate), extraHourRate: num(b.vehicle.extraHourRate) }, input, completedAt);
    const commission = round2((bill.taxable * num(b.commissionRate)) / 100);
    await transition(tx, b, 'TRIP_COMPLETED', actor.id, `Trip completed (${bill.actualKm} km)${input.notes ? ` — ${input.notes}` : ''}`, {
      endOdometer: input.endOdometer,
      completedAt,
      extraCharges: bill as unknown as Prisma.InputJsonValue,
      finalAmount: bill.total,
      taxAmount: bill.gst,
      commissionAmount: commission,
      ownerPayout: round2(bill.taxable - commission + bill.passThrough),
    });
    await tx.driverAssignment.updateMany({ where: { bookingId, status: { in: ['ASSIGNED', 'ACCEPTED'] } }, data: { status: 'COMPLETED' } });
    return { b, bill };
  });
  const { createInvoice } = await import('../invoices/service.js');
  await createInvoice(bookingId, 'TAX_INVOICE').catch(() => undefined);
  const balance = round2(result.bill.total - num(result.b.paidAmount));
  const cust = await prisma.user.findUnique({ where: { id: result.b.customerId } });
  await notify({ userId: result.b.customerId, phone: cust?.phone, email: cust?.email }, 'TRIP_COMPLETED', {
    bookingId,
    bookingNumber: result.b.bookingNumber,
    finalAmount: formatINR(result.bill.total),
    balance: formatINR(Math.max(0, balance)),
  });
  return { ...result.bill, balance };
}

// ───────────────────────────── Cancellation ─────────────────────────────

export function cancellationRefund(b: Pick<Booking, 'pickupAt' | 'paidAmount'>, tiers: { hoursBefore: number; refundPercent: number }[], now = new Date()) {
  const hoursBefore = (b.pickupAt.getTime() - now.getTime()) / 3_600_000;
  const pct = refundPercentFor(hoursBefore, tiers);
  const paid = num(b.paidAmount);
  const refund = round2((paid * pct) / 100);
  return { hoursBefore: Math.max(0, Math.floor(hoursBefore)), refundPercent: pct, refundAmount: refund, fee: round2(paid - refund) };
}

export async function cancelBooking(
  bookingId: string,
  actor: AuthUser,
  reason: string,
  opts: { mode: 'customer' | 'owner_reject' | 'admin'; refundAmount?: number } = { mode: 'customer' },
) {
  const tiers = (await getSettings())['cancellation.tiers'];
  const out = await withTx(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { availability: true } });
    if (!b) throw notFound('Booking');
    if (opts.mode === 'customer') {
      if (b.customerId !== actor.id) throw forbidden();
      if (!CANCELLABLE_BY_CUSTOMER.includes(b.status)) throw conflict('This booking can no longer be cancelled online. Please contact support.');
    }
    const policy = cancellationRefund(b, tiers);
    const paid = num(b.paidAmount);
    const refundAmount =
      opts.mode === 'owner_reject' ? paid : opts.mode === 'admin' ? Math.min(paid, opts.refundAmount ?? paid) : policy.refundAmount;

    await transition(tx, b, 'CANCELLED', actor.id, reason, {
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason: reason,
      cancellationFee: round2(paid - refundAmount),
      ...(opts.mode === 'owner_reject' ? { ownerDecision: 'REJECTED', ownerDecisionAt: new Date(), ownerNote: reason } : {}),
    });
    await tx.vehicleAvailability.updateMany({ where: { bookingId, active: true }, data: { active: false } });
    await tx.driverAssignment.updateMany({ where: { bookingId, status: { in: ['ASSIGNED', 'ACCEPTED'] } }, data: { status: 'CANCELLED' } });
    return { b, refundAmount, policy };
  });

  if (out.refundAmount > 0) {
    const { initiateRefund } = await import('../payments/service.js');
    await initiateRefund(bookingId, out.refundAmount, `Cancellation: ${reason}`, actor.id);
  }
  const cust = await prisma.user.findUnique({ where: { id: out.b.customerId } });
  await notify({ userId: out.b.customerId, phone: cust?.phone, email: cust?.email }, 'BOOKING_CANCELLED', {
    bookingNumber: out.b.bookingNumber,
    refundText: out.refundAmount > 0 ? `A refund of ${formatINR(out.refundAmount)} has been initiated.` : num(out.b.paidAmount) > 0 ? 'As per the cancellation policy, no refund is applicable.' : '',
  });
  return { refundAmount: out.refundAmount, policy: out.policy };
}

export async function ownerDecide(bookingId: string, actor: AuthUser, ownerId: string, accept: boolean, note?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.ownerId !== ownerId) throw notFound('Booking');
  if (b.ownerDecision !== 'PENDING') throw conflict('You have already responded to this booking');
  if (accept) {
    await prisma.booking.update({ where: { id: bookingId }, data: { ownerDecision: 'ACCEPTED', ownerDecisionAt: new Date(), ownerNote: note } });
    await prisma.bookingStatusHistory.create({ data: { bookingId, fromStatus: b.status, toStatus: b.status, actorId: actor.id, note: 'Owner accepted the booking' } });
    return { accepted: true };
  }
  await cancelBooking(bookingId, actor, note || 'Vehicle owner declined the booking', { mode: 'owner_reject' });
  return { accepted: false };
}
