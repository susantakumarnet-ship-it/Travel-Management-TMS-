import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { body, query, zBoolish, zPage, zText } from '../../lib/validate.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { requirePermission, hasPermission } from '../../middleware/auth.js';
import type { RequestHandler } from 'express';
const requireAnyPermission = (perms: string[]): RequestHandler => (req, _res, next) => (perms.some((p) => hasPermission(req.user, p)) ? next() : next(forbidden()));
import { audit } from '../../lib/audit.js';
import { formatINR, pageResult, paginate } from '../../lib/util.js';
import { privateFile } from '../../integrations/storage.js';
import { notify } from '../notifications/service.js';
import {
  assignDriver,
  bookingInclude,
  cancelBooking,
  cancellationRefund,
  completeTrip,
  dispatchVehicle,
  startTrip,
  transition,
} from '../bookings/service.js';
import { recordOfflinePayment } from '../payments/service.js';
import { getSettings } from '../../lib/settings.js';

const r = Router();

// ───────────────────── Bookings ─────────────────────

r.get('/bookings', requirePermission('bookings:read'), async (req, res) => {
  const q = query(
    req,
    zPage.extend({
      status: z.string().optional(),
      purpose: z.string().optional(),
      q: z.string().max(80).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      ownerId: z.string().optional(),
      vehicleId: z.string().optional(),
      driverId: z.string().optional(),
      sort: z.enum(['created', 'pickup']).default('created'),
    }),
  );
  const where: Prisma.BookingWhereInput = {
    ...(q.status ? { status: { in: q.status.split(',') as Prisma.EnumBookingStatusFilter['in'] } } : {}),
    ...(q.purpose ? { purpose: q.purpose as Prisma.EnumTravelPurposeFilter['equals'] } : {}),
    ...(q.ownerId ? { ownerId: q.ownerId } : {}),
    ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
    ...(q.driverId ? { driverId: q.driverId } : {}),
    ...(q.from || q.to ? { pickupAt: { gte: q.from, lte: q.to } } : {}),
    ...(q.q
      ? { OR: [{ bookingNumber: { contains: q.q, mode: 'insensitive' } }, { customer: { phone: { contains: q.q } } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }, { vehicle: { registrationNumber: { contains: q.q.replace(/\s/g, ''), mode: 'insensitive' } } }] }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: q.sort === 'pickup' ? { pickupAt: 'asc' } : { createdAt: 'desc' },
      ...paginate(q.page, q.pageSize),
      include: {
        customer: { select: { name: true, phone: true } },
        vehicle: { select: { title: true, registrationNumber: true } },
        owner: { select: { businessName: true } },
        driver: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/bookings/:id', requirePermission('bookings:read'), async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { id: req.params.id }, include: bookingInclude });
  if (!b) throw notFound('Booking');
  const tiers = (await getSettings())['cancellation.tiers'];
  res.json({ ...b, cancellationPreview: cancellationRefund(b, tiers) });
});

r.get('/bookings/:id/available-drivers', requirePermission('bookings:read'), async (req, res) => {
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(
    await prisma.driver.findMany({
      where: {
        verificationStatus: 'APPROVED',
        user: { status: 'ACTIVE' },
        licenceExpiry: { gte: b.returnAt },
        bookings: { none: { id: { not: b.id }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED'] }, pickupAt: { lt: b.returnAt }, returnAt: { gt: b.pickupAt } } },
      },
      include: { user: { select: { name: true, phone: true } }, owner: { select: { businessName: true } } },
      orderBy: [{ ratingAvg: 'desc' }],
    }),
  );
});

r.post('/bookings/:id/assign-driver', requirePermission('bookings:write'), async (req, res) => {
  const { driverId } = body(req, z.object({ driverId: z.string() }));
  await assignDriver(req.params.id, driverId, req.user!);
  await audit(req, 'booking.assign_driver', 'Booking', req.params.id, { after: { driverId } });
  res.json({ ok: true });
});

r.post('/bookings/:id/status', requirePermission('bookings:write'), async (req, res) => {
  const d = body(
    req,
    z.discriminatedUnion('action', [
      z.object({ action: z.literal('dispatch') }),
      z.object({ action: z.literal('start'), startOdometer: z.coerce.number().int().min(0) }),
      z.object({ action: z.literal('complete'), endOdometer: z.coerce.number().int().min(0), tolls: z.coerce.number().min(0).default(0), parking: z.coerce.number().min(0).default(0), stateTax: z.coerce.number().min(0).optional(), notes: zText(500).optional() }),
      z.object({ action: z.literal('confirm'), note: zText(300).optional() }),
    ]),
  );
  let out: unknown = { ok: true };
  if (d.action === 'dispatch') await dispatchVehicle(req.params.id, req.user!);
  else if (d.action === 'start') await startTrip(req.params.id, req.user!, d.startOdometer);
  else if (d.action === 'complete') out = await completeTrip(req.params.id, req.user!, d);
  else if (d.action === 'confirm') {
    // Manual confirmation (e.g. corporate account on credit). Keeps the slot permanently.
    await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: req.params.id } });
      await transition(tx, b, 'CONFIRMED', req.user!.id, d.note ?? 'Confirmed manually by admin');
      await tx.vehicleAvailability.updateMany({ where: { bookingId: b.id }, data: { holdExpiresAt: null, active: true } });
    });
  }
  await audit(req, `booking.${d.action}`, 'Booking', req.params.id, { after: d });
  res.json(out);
});

r.post('/bookings/:id/cancel', requirePermission('bookings:write'), async (req, res) => {
  const d = body(req, z.object({ reason: zText(500).pipe(z.string().min(3)), refundAmount: z.coerce.number().min(0).optional() }));
  const out = await cancelBooking(req.params.id, req.user!, d.reason, { mode: 'admin', refundAmount: d.refundAmount });
  await audit(req, 'booking.cancel', 'Booking', req.params.id, { after: { ...d, ...out } });
  res.json(out);
});

r.post('/bookings/:id/payments', requirePermission('payments:write'), async (req, res) => {
  const d = body(req, z.object({ amount: z.coerce.number().positive(), method: z.enum(['CASH', 'BANK_TRANSFER']), reference: zText(60).optional() }));
  const p = await recordOfflinePayment(req.params.id, req.user!, d.amount, d.method, d.reference);
  await audit(req, 'payment.record_offline', 'Payment', p.id, { after: d });
  res.json(p);
});

r.patch('/bookings/:id/notes', requirePermission('bookings:write'), async (req, res) => {
  const { note } = body(req, z.object({ note: zText(1000).pipe(z.string().min(1)) }));
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
  await prisma.bookingStatusHistory.create({ data: { bookingId: b.id, fromStatus: b.status, toStatus: b.status, actorId: req.user!.id, note: `Note: ${note}` } });
  res.json({ ok: true });
});

// ───────────────────── Wedding requests ─────────────────────

r.get('/weddings', requirePermission('weddings:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional(), upcoming: zBoolish.optional() }));
  const where: Prisma.WeddingRequestWhereInput = {
    ...(q.status ? { status: q.status as Prisma.EnumWeddingRequestStatusFilter['equals'] } : {}),
    ...(q.upcoming ? { weddingDate: { gte: new Date() } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.weddingRequest.count({ where }),
    prisma.weddingRequest.findMany({ where, orderBy: { weddingDate: 'asc' }, ...paginate(q.page, q.pageSize), include: { customer: { select: { name: true, phone: true } }, package: { select: { name: true } }, _count: { select: { bookings: true } } } }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/weddings/:id', requirePermission('weddings:read'), async (req, res) => {
  const w = await prisma.weddingRequest.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      package: true,
      pickupPoints: { orderBy: { sequence: 'asc' } },
      bookings: { include: { vehicle: { select: { title: true, registrationNumber: true } }, driver: { select: { user: { select: { name: true } } } } } },
    },
  });
  if (!w) throw notFound('Wedding request');
  const categories = await prisma.vehicleCategory.findMany({ where: { id: { in: w.preferredCategoryIds } }, select: { id: true, name: true } });
  res.json({ ...w, preferredCategories: categories });
});

r.post('/weddings/:id/quote', requirePermission('weddings:write'), async (req, res) => {
  const d = body(
    req,
    z.object({
      items: z.array(z.object({ description: zText(200), quantity: z.coerce.number().int().min(1), unitPrice: z.coerce.number().min(0) })).min(1).max(30),
      discount: z.coerce.number().min(0).default(0),
      gstPercent: z.coerce.number().min(0).max(28).default(5),
      notes: zText(2000).optional(),
      validDays: z.coerce.number().int().min(1).max(60).default(7),
    }),
  );
  const subtotal = d.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const taxable = Math.max(0, subtotal - d.discount);
  const gst = Math.round(taxable * d.gstPercent) / 100;
  const total = Math.round((taxable + gst) * 100) / 100;
  const w = await prisma.weddingRequest.update({
    where: { id: req.params.id },
    data: { status: 'QUOTED', quotedAmount: total, quoteBreakdown: { ...d, subtotal, taxable, gst, total } as Prisma.InputJsonValue, quoteNotes: d.notes, quotedAt: new Date(), quoteValidUntil: new Date(Date.now() + d.validDays * 86_400_000) },
    include: { customer: true },
  });
  await audit(req, 'wedding.quote', 'WeddingRequest', w.id, { after: { total } });
  void notify({ userId: w.customerId, phone: w.customer.phone, email: w.customer.email }, 'WEDDING_QUOTED', { requestNumber: w.requestNumber, amount: formatINR(total) });
  res.json(w);
});

r.patch('/weddings/:id/status', requirePermission('weddings:write'), async (req, res) => {
  const { status } = body(req, z.object({ status: z.enum(['ENQUIRY', 'QUOTED', 'ACCEPTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']) }));
  const w = await prisma.weddingRequest.update({ where: { id: req.params.id }, data: { status } });
  await audit(req, 'wedding.status', 'WeddingRequest', w.id, { after: { status } });
  res.json(w);
});

/** Link existing vehicle bookings to a wedding (admin books cars via the normal engine for the customer). */
r.post('/weddings/:id/link-booking', requirePermission('weddings:write'), async (req, res) => {
  const { bookingId } = body(req, z.object({ bookingId: z.string() }));
  const w = await prisma.weddingRequest.findUniqueOrThrow({ where: { id: req.params.id } });
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (b.customerId !== w.customerId) throw conflict('Booking belongs to a different customer');
  res.json(await prisma.booking.update({ where: { id: bookingId }, data: { weddingRequestId: w.id } }));
});

// ───────────────────── Enquiries ─────────────────────

r.get('/enquiries', requirePermission('customers:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']).optional(), type: z.string().optional() }));
  const where: Prisma.EnquiryWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.type ? { type: q.type as Prisma.EnumEnquiryTypeFilter['equals'] } : {}) };
  const [total, items] = await Promise.all([prisma.enquiry.count({ where }), prisma.enquiry.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize) })]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});
r.patch('/enquiries/:id', requirePermission('customers:write'), async (req, res) => {
  const { status } = body(req, z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']) }));
  res.json(await prisma.enquiry.update({ where: { id: req.params.id }, data: { status } }));
});

// ───────────────────── Private document access ─────────────────────

r.get('/files', requireAnyPermission(['vehicles:read', 'owners:read', 'drivers:read', 'weddings:read']), async (req, res) => {
  const { key } = query(req, z.object({ key: z.string().startsWith('private/').max(400) }));
  const f = await privateFile(key);
  await audit(req, 'document.view', 'File', key);
  if (f.url) return res.redirect(f.url);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(f.localPath!);
});

export default r;
