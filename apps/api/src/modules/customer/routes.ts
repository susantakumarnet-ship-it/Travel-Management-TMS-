import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, nullish, setAnd } from '../../lib/prisma.js';
import { body, query, zPage, zText } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { upload, storeUpload } from '../../middleware/upload.js';
import { getSettings } from '../../lib/settings.js';
import { nextWeddingNumber } from '../../lib/sequence.js';
import { formatIstDate, pageResult, paginate, round2, formatINR, num } from '../../lib/util.js';
import { bookingInclude, cancelBooking, cancellationRefund, createBooking, getBookingForUser } from '../bookings/service.js';
import { createPaymentOrder, markPaymentFailed, verifyCheckout } from '../payments/service.js';
import { renderInvoicePdf } from '../invoices/service.js';
import { notify, notifyAdmins } from '../notifications/service.js';
import { defaultTripType } from '../public/routes.js';

const r = Router();
r.use(requireAuth, requireRole('CUSTOMER'));

// ───────────────────── Profile & addresses ─────────────────────

r.patch('/profile', async (req, res) => {
  const d = body(
    req,
    z.object({
      name: zText(120).pipe(z.string().min(2)).optional(),
      email: z.string().email().optional().or(z.literal('')),
      gender: z.string().max(20).optional(),
      dateOfBirth: z.coerce.date().optional().nullable(),
      gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').optional().or(z.literal('')),
      companyName: zText(160).optional(),
      emergencyName: zText(120).optional(),
      emergencyPhone: z.string().max(15).optional(),
    }),
  );
  const { name, email, ...profile } = d;
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      name,
      email: email === '' ? null : email?.toLowerCase(),
      customerProfile: { upsert: { create: { ...profile, gstin: profile.gstin || null }, update: { ...profile, gstin: profile.gstin || null } } },
    },
  });
  res.json({ ok: true });
});

const addressSchema = z.object({
  label: zText(40).default('Home'),
  line1: zText(200).pipe(z.string().min(3)),
  line2: zText(200).optional(),
  city: zText(80).pipe(z.string().min(2)),
  state: zText(80).pipe(z.string().min(2)),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().default(false),
});

r.get('/addresses', async (req, res) => {
  res.json(await prisma.address.findMany({ where: { userId: req.user!.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }));
});
r.post('/addresses', async (req, res) => {
  const d = body(req, addressSchema);
  const count = await prisma.address.count({ where: { userId: req.user!.id } });
  if (count >= 10) throw badRequest('You can save up to 10 addresses');
  const a = await prisma.$transaction(async (tx) => {
    if (d.isDefault || count === 0) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    return tx.address.create({ data: { ...d, isDefault: d.isDefault || count === 0, userId: req.user!.id } });
  });
  res.status(201).json(a);
});
r.put('/addresses/:id', async (req, res) => {
  const d = body(req, addressSchema);
  const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) throw notFound('Address');
  const a = await prisma.$transaction(async (tx) => {
    if (d.isDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: d });
  });
  res.json(a);
});
r.delete('/addresses/:id', async (req, res) => {
  const n = await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (!n.count) throw notFound('Address');
  res.json({ ok: true });
});

// ───────────────────── Bookings ─────────────────────

const PURPOSES = ['WEDDING', 'FAMILY_TRIP', 'BUSINESS', 'AIRPORT_TRANSFER', 'LOCAL_TRAVEL', 'OUTSTATION', 'OTHER'] as const;

r.post('/bookings', async (req, res) => {
  const d = body(
    req,
    z.object({
      vehicleId: z.string().min(1),
      purpose: z.enum(PURPOSES),
      tripType: z.enum(['LOCAL_HOURLY', 'OUTSTATION', 'AIRPORT_TRANSFER', 'MULTI_DAY', 'SELF_DRIVE']).optional(),
      withDriver: z.boolean().default(true),
      pickupAt: z.coerce.date(),
      returnAt: z.coerce.date(),
      pickupAddress: zText(300).pipe(z.string().min(3, 'Enter pickup address')),
      dropAddress: zText(300).optional(),
      stops: z.array(zText(300)).max(8).optional(),
      estimatedKm: z.coerce.number().int().min(0).max(20000).default(0),
      passengers: z.coerce.number().int().min(1).max(60),
      luggageBags: z.coerce.number().int().min(0).max(40).default(0),
      acRequired: z.boolean().default(true),
      decoration: z.boolean().default(false),
      destinationState: zText(80).optional(),
      estimatedTolls: z.coerce.number().min(0).max(100000).optional(),
      specialRequests: zText(1000).optional(),
      couponCode: z.string().trim().max(30).optional().or(z.literal('')),
      passengerList: z.array(z.object({ name: zText(120).pipe(z.string().min(1)), phone: z.string().max(15).optional(), age: z.coerce.number().int().min(0).max(120).optional() })).max(60).optional(),
      weddingRequestId: z.string().optional(),
      travelPackageId: z.string().optional(),
    }),
  );
  if (d.weddingRequestId) {
    const w = await prisma.weddingRequest.findFirst({ where: { id: d.weddingRequestId, customerId: req.user!.id } });
    if (!w) throw notFound('Wedding request');
  }
  const hours = Math.ceil((d.returnAt.getTime() - d.pickupAt.getTime()) / 3_600_000);
  const booking = await createBooking(req.user!, {
    ...d,
    tripType: d.tripType ?? defaultTripType(d.purpose, hours, d.withDriver),
    couponCode: d.couponCode || undefined,
  });
  res.status(201).json(booking);
});

r.get('/bookings', async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional(), scope: z.enum(['upcoming', 'past', 'all']).default('all') }));
  const now = new Date();
  const where: Prisma.BookingWhereInput = {
    customerId: req.user!.id,
    ...(q.status ? { status: q.status as Prisma.EnumBookingStatusFilter['equals'] } : {}),
    ...(q.scope === 'upcoming' ? { returnAt: { gte: now }, status: { notIn: ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED', 'TRIP_COMPLETED'] } } : {}),
    ...(q.scope === 'past' ? { OR: [{ returnAt: { lt: now } }, { status: { in: ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED', 'TRIP_COMPLETED'] } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { pickupAt: q.scope === 'upcoming' ? 'asc' : 'desc' },
      ...paginate(q.page, q.pageSize),
      include: { vehicle: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } }, category: true } }, review: { select: { id: true, rating: true } } },
    }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/bookings/:id', async (req, res) => {
  const b = await getBookingForUser(req.params.id, req.user!);
  const hold = await prisma.vehicleAvailability.findFirst({ where: { bookingId: b.id, active: true }, select: { holdExpiresAt: true } });
  const tiers = (await getSettings())['cancellation.tiers'];
  res.json({ ...b, holdExpiresAt: hold?.holdExpiresAt ?? null, cancellationPreview: cancellationRefund(b, tiers) });
});

r.post('/bookings/:id/cancel', async (req, res) => {
  const { reason } = body(req, z.object({ reason: zText(500).pipe(z.string().min(3, 'Please tell us why you are cancelling')) }));
  res.json(await cancelBooking(req.params.id, req.user!, reason, { mode: 'customer' }));
});

// ───────────────────── Payments ─────────────────────

r.post('/bookings/:id/payments', async (req, res) => {
  const { purpose } = body(req, z.object({ purpose: z.enum(['ADVANCE', 'FULL', 'BALANCE']).default('ADVANCE') }));
  res.json(await createPaymentOrder(req.params.id, req.user!, purpose));
});

r.post('/payments/:paymentId/verify', async (req, res) => {
  const b = body(req, z.record(z.string(), z.string().max(500)));
  const p = await verifyCheckout(req.params.paymentId, req.user!, b);
  res.json({ ok: true, status: p.status, bookingId: p.bookingId });
});

r.post('/payments/:paymentId/failed', async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().max(300).default('Cancelled by user') }));
  await markPaymentFailed(req.params.paymentId, req.user!, reason);
  res.json({ ok: true });
});

// ───────────────────── Invoices ─────────────────────

r.get('/invoices/:id/pdf', async (req, res) => {
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { booking: { select: { customerId: true } } } });
  if (!inv || inv.booking.customerId !== req.user!.id) throw notFound('Invoice');
  const pdf = await renderInvoicePdf(inv.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.invoiceNumber.replace(/\//g, '-')}.pdf"`);
  res.send(pdf);
});

// ───────────────────── Reviews ─────────────────────

r.post('/bookings/:id/review', async (req, res) => {
  const d = body(
    req,
    z.object({
      rating: z.number().int().min(1).max(5),
      vehicleRating: z.number().int().min(1).max(5).optional(),
      driverRating: z.number().int().min(1).max(5).optional(),
      comment: zText(2000).optional(),
    }),
  );
  const b = await prisma.booking.findFirst({ where: { id: req.params.id, customerId: req.user!.id } });
  if (!b) throw notFound('Booking');
  if (b.status !== 'TRIP_COMPLETED') throw conflict('You can review a booking after the trip is completed');
  const review = await prisma.$transaction(async (tx) => {
    const rv = await tx.review.create({ data: { ...d, bookingId: b.id, customerId: b.customerId, vehicleId: b.vehicleId, driverId: b.driverId } });
    const agg = await tx.review.aggregate({ where: { vehicleId: b.vehicleId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: true });
    await tx.vehicle.update({ where: { id: b.vehicleId }, data: { ratingAvg: round2(agg._avg.rating ?? 0), ratingCount: agg._count } });
    if (b.driverId && d.driverRating) {
      const da = await tx.review.aggregate({ where: { driverId: b.driverId, AND: [setAnd('driverRating', {})], status: 'PUBLISHED' }, _avg: { driverRating: true }, _count: true });
      await tx.driver.update({ where: { id: b.driverId }, data: { ratingAvg: round2(da._avg.driverRating ?? 0), ratingCount: da._count } });
    }
    return rv;
  });
  res.status(201).json(review);
});

// ───────────────────── Wedding requests ─────────────────────

const weddingSchema = z.object({
  packageId: z.string().optional().or(z.literal('')),
  weddingDate: z.coerce.date(),
  venueName: zText(200).pipe(z.string().min(2)),
  venueAddress: zText(300).pipe(z.string().min(3)),
  dropLocation: zText(300).optional(),
  rentalMode: z.enum(['HOURLY', 'FULL_DAY']).default('FULL_DAY'),
  hours: z.coerce.number().int().min(2).max(24).optional(),
  totalVehicles: z.coerce.number().int().min(1).max(100),
  brideCar: z.boolean().default(false),
  groomCar: z.boolean().default(false),
  guestVehicles: z.coerce.number().int().min(0).max(100).default(0),
  guestCount: z.coerce.number().int().min(0).max(5000).optional(),
  decoratedCars: z.coerce.number().int().min(0).max(50).default(0),
  preferredCategoryIds: z.array(z.string()).max(10).default([]),
  decorationRequest: zText(1000).optional(),
  events: z.array(z.object({ name: zText(80), date: z.string().max(10), vehicles: z.coerce.number().int().min(1).max(100), notes: zText(300).optional() })).max(10).default([]),
  pickupPoints: z.array(z.object({ label: zText(80).optional(), address: zText(300).pipe(z.string().min(3)), pickupTime: z.string().max(10).optional(), passengers: z.coerce.number().int().min(0).max(500).optional() })).max(20).default([]),
  notes: zText(2000).optional(),
});

r.post('/weddings', upload.single('itinerary'), async (req, res) => {
  // multipart: JSON payload in "data" field + optional itinerary file
  const raw = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : req.body;
  const d = weddingSchema.parse(raw);
  if (d.weddingDate < new Date(Date.now() - 86_400_000)) throw badRequest('Wedding date must be in the future');
  const itineraryFileKey = req.file ? await storeUpload(req.file, 'private', 'wedding-itineraries') : undefined;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const w = await prisma.$transaction(async (tx) =>
    tx.weddingRequest.create({
      data: {
        requestNumber: await nextWeddingNumber(tx),
        customerId: req.user!.id,
        packageId: d.packageId || null,
        weddingDate: d.weddingDate,
        venueName: d.venueName,
        venueAddress: d.venueAddress,
        dropLocation: d.dropLocation,
        rentalMode: d.rentalMode,
        hours: d.hours,
        totalVehicles: d.totalVehicles,
        brideCar: d.brideCar,
        groomCar: d.groomCar,
        guestVehicles: d.guestVehicles,
        guestCount: d.guestCount,
        decoratedCars: d.decoratedCars,
        preferredCategoryIds: d.preferredCategoryIds,
        decorationRequest: d.decorationRequest,
        events: d.events as Prisma.InputJsonValue,
        notes: d.notes,
        itineraryFileKey,
        pickupPoints: { create: d.pickupPoints.map((p, i) => ({ ...p, sequence: i })) },
      },
    }),
  );
  void notify({ userId: user.id, phone: user.phone, email: user.email }, 'WEDDING_REQUEST', { name: user.name ?? 'there', requestNumber: w.requestNumber, weddingDate: formatIstDate(w.weddingDate) });
  void notifyAdmins('New wedding request', `${w.requestNumber}: ${d.totalVehicles} vehicle(s) on ${formatIstDate(w.weddingDate)} at ${d.venueName}`);
  res.status(201).json(w);
});

r.get('/weddings', async (req, res) => {
  res.json(
    await prisma.weddingRequest.findMany({
      where: { customerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { package: true, pickupPoints: { orderBy: { sequence: 'asc' } }, bookings: { select: { id: true, bookingNumber: true, status: true, vehicle: { select: { title: true } } } } },
    }),
  );
});

r.post('/weddings/:id/accept', async (req, res) => {
  const w = await prisma.weddingRequest.findFirst({ where: { id: req.params.id, customerId: req.user!.id } });
  if (!w) throw notFound('Wedding request');
  if (w.status !== 'QUOTED') throw conflict('There is no open quote to accept');
  if (w.quoteValidUntil && w.quoteValidUntil < new Date()) throw conflict('This quote has expired. Please ask for a revised quote.');
  await prisma.weddingRequest.update({ where: { id: w.id }, data: { status: 'ACCEPTED' } });
  void notifyAdmins('Wedding quote accepted', `${w.requestNumber} accepted (${formatINR(num(w.quotedAmount))}). Please allocate vehicles.`);
  res.json({ ok: true });
});

// ───────────────────── In-app notifications ─────────────────────

export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);
notificationRoutes.get('/', async (req, res) => {
  const items = await prisma.notification.findMany({ where: { userId: req.user!.id, channel: 'IN_APP' }, orderBy: { createdAt: 'desc' }, take: 50 });
  const unread = await prisma.notification.count({ where: { userId: req.user!.id, channel: 'IN_APP', AND: [nullish('readAt')] } });
  res.json({ items, unread });
});
notificationRoutes.post('/read', async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(100).optional() }));
  await prisma.notification.updateMany({ where: { userId: req.user!.id, channel: 'IN_APP', AND: [nullish('readAt')], ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

export { bookingInclude };
export default r;
