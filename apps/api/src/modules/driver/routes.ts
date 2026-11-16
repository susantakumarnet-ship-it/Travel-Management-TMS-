import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { body, query, zPage, zText } from '../../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { upload, storeUpload } from '../../middleware/upload.js';
import { pageResult, paginate, num, round2, istMonthStart } from '../../lib/util.js';
import { notifyAdmins } from '../notifications/service.js';
import { completeTrip, dispatchVehicle, driverRespond, getBookingForUser, startTrip } from '../bookings/service.js';
import { recordOfflinePayment } from '../payments/service.js';

const r = Router();
r.use(requireAuth, requireRole('DRIVER'));

async function currentDriver(userId: string) {
  const d = await prisma.driver.findUnique({ where: { userId } });
  if (!d) throw badRequest('Please complete your driver registration first');
  return d;
}

/** Ensures the driver is the active assignee of the booking. */
async function myBooking(bookingId: string, driverId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.driverId !== driverId) throw notFound('Trip');
  return b;
}

r.post('/register', async (req, res) => {
  const d = body(
    req,
    z.object({
      name: zText(120).pipe(z.string().min(2)),
      email: z.string().email().optional().or(z.literal('')),
      licenceNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{7}$|^[A-Z0-9-\s]{10,20}$/, 'Invalid driving licence number').transform((s) => s.replace(/[\s-]/g, '')),
      licenceExpiry: z.coerce.date(),
      experienceYears: z.coerce.number().int().min(0).max(50),
      languages: z.array(zText(30)).max(8).default([]),
      dateOfBirth: z.coerce.date().optional(),
      address: zText(300).optional(),
      cityId: z.string().optional(),
    }),
  );
  if (d.licenceExpiry < new Date()) throw badRequest('Your driving licence has expired');
  if (d.dateOfBirth) {
    const age = (Date.now() - d.dateOfBirth.getTime()) / (365.25 * 86_400_000);
    if (age < 21) throw badRequest('Drivers must be at least 21 years old');
  }
  const { name, email, ...rest } = d;
  const driver = await prisma.driver.upsert({
    where: { userId: req.user!.id },
    create: { ...rest, userId: req.user!.id },
    update: rest,
  });
  await prisma.user.update({ where: { id: req.user!.id }, data: { name, email: email ? email.toLowerCase() : undefined } });
  void notifyAdmins('New driver registration', `${name} (${d.licenceNumber}) registered and is awaiting verification.`);
  res.json(driver);
});

r.get('/profile', async (req, res) => {
  res.json(
    await prisma.driver.findUnique({
      where: { userId: req.user!.id },
      include: { documents: { orderBy: { createdAt: 'desc' } }, owner: { select: { businessName: true } }, city: true, user: { select: { name: true, phone: true, email: true, status: true } } },
    }),
  );
});

r.post('/documents', upload.single('file'), async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const d = z.object({ type: z.enum(['DRIVING_LICENCE', 'AADHAAR', 'PAN', 'POLICE_VERIFICATION', 'OTHER']), number: z.string().max(60).optional(), expiresAt: z.coerce.date().optional() }).parse(req.body);
  const fileKey = await storeUpload(req.file, 'private', `drivers/${drv.id}`);
  const doc = await prisma.driverDocument.create({ data: { driverId: drv.id, ...d, fileKey } });
  if (d.type === 'DRIVING_LICENCE' && d.expiresAt) await prisma.driver.update({ where: { id: drv.id }, data: { licenceExpiry: d.expiresAt } });
  res.status(201).json(doc);
});

r.patch('/availability', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const { isAvailable } = body(req, z.object({ isAvailable: z.boolean() }));
  res.json(await prisma.driver.update({ where: { id: drv.id }, data: { isAvailable } }));
});

// ───────────────────── Trips ─────────────────────

const tripSelect = {
  vehicle: { select: { title: true, registrationNumber: true, color: true, seats: true } },
  customer: { select: { name: true, phone: true } },
  locations: { orderBy: { sequence: 'asc' } },
  assignments: { orderBy: { assignedAt: 'desc' }, take: 1 },
} satisfies Prisma.BookingInclude;

r.get('/dashboard', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const now = new Date();
  const monthStart = istMonthStart(now);
  const [pending, upcoming, current, monthAgg, totalAgg, totalTrips] = await Promise.all([
    prisma.booking.findMany({ where: { driverId: drv.id, assignments: { some: { driverId: drv.id, status: 'ASSIGNED' } }, status: 'DRIVER_ASSIGNED' }, include: tripSelect, orderBy: { pickupAt: 'asc' } }),
    prisma.booking.findMany({ where: { driverId: drv.id, status: { in: ['DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED'] }, pickupAt: { gte: new Date(now.getTime() - 12 * 3_600_000) } }, include: tripSelect, orderBy: { pickupAt: 'asc' }, take: 10 }),
    prisma.booking.findFirst({ where: { driverId: drv.id, status: 'TRIP_STARTED' }, include: tripSelect }),
    prisma.driverAssignment.aggregate({ where: { driverId: drv.id, status: 'COMPLETED', booking: { completedAt: { gte: monthStart } } }, _sum: { driverEarning: true }, _count: true }),
    prisma.driverAssignment.aggregate({ where: { driverId: drv.id, status: 'COMPLETED' }, _sum: { driverEarning: true } }),
    prisma.booking.count({ where: { driverId: drv.id, status: 'TRIP_COMPLETED' } }),
  ]);
  res.json({
    driver: drv,
    pending,
    upcoming,
    current,
    stats: {
      monthTrips: monthAgg._count,
      monthEarnings: num(monthAgg._sum.driverEarning),
      totalEarnings: num(totalAgg._sum.driverEarning),
      totalTrips,
      rating: drv.ratingAvg,
    },
  });
});

r.get('/trips', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const q = query(req, zPage.extend({ scope: z.enum(['upcoming', 'history', 'all']).default('upcoming') }));
  const where: Prisma.BookingWhereInput = {
    driverId: drv.id,
    ...(q.scope === 'upcoming' ? { status: { in: ['DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED'] } } : {}),
    ...(q.scope === 'history' ? { status: { in: ['TRIP_COMPLETED', 'CANCELLED', 'REFUND_INITIATED', 'REFUNDED'] } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({ where, include: tripSelect, orderBy: { pickupAt: q.scope === 'upcoming' ? 'asc' : 'desc' }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/trips/:id', async (req, res) => {
  const b = await getBookingForUser(req.params.id, req.user!);
  // Drivers don't need payment internals or other parties' financials.
  const { payments: _p, refunds: _r, invoices: _i, commissionAmount: _c, commissionRate: _cr, ownerPayout: _o, ...safe } = b;
  void _p; void _r; void _i; void _c; void _cr; void _o;
  res.json({ ...safe, balanceDue: round2(Math.max(0, num(b.finalAmount ?? b.totalAmount) - num(b.paidAmount))) });
});

r.post('/trips/:id/respond', async (req, res) => {
  const { accept, note } = body(req, z.object({ accept: z.boolean(), note: zText(300).optional() }));
  await driverRespond(req.params.id, req.user!.id, accept, note);
  res.json({ ok: true });
});

async function requireAccepted(bookingId: string, driverId: string) {
  const a = await prisma.driverAssignment.findFirst({ where: { bookingId, driverId, status: { in: ['ACCEPTED', 'COMPLETED'] } } });
  if (!a) throw conflict('Please accept the trip first');
}

r.post('/trips/:id/dispatch', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  await myBooking(req.params.id, drv.id);
  await requireAccepted(req.params.id, drv.id);
  await dispatchVehicle(req.params.id, req.user!);
  res.json({ ok: true });
});

r.post('/trips/:id/start', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  await myBooking(req.params.id, drv.id);
  await requireAccepted(req.params.id, drv.id);
  const { startOdometer } = body(req, z.object({ startOdometer: z.coerce.number().int().min(0).max(9_999_999) }));
  await startTrip(req.params.id, req.user!, startOdometer);
  res.json({ ok: true });
});

r.post('/trips/:id/complete', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const b = await myBooking(req.params.id, drv.id);
  if (b.status !== 'TRIP_STARTED') throw conflict('Trip has not started');
  const d = body(
    req,
    z.object({
      endOdometer: z.coerce.number().int().min(0).max(9_999_999),
      tolls: z.coerce.number().min(0).max(100_000).default(0),
      parking: z.coerce.number().min(0).max(50_000).default(0),
      stateTax: z.coerce.number().min(0).max(100_000).optional(),
      notes: zText(500).optional(),
    }),
  );
  if (b.startOdometer != null && d.endOdometer - b.startOdometer > 5000) throw badRequest('Distance looks incorrect. Please check the odometer reading.');
  res.json(await completeTrip(req.params.id, req.user!, d));
});

r.post('/trips/:id/collect', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const b = await myBooking(req.params.id, drv.id);
  if (!['TRIP_STARTED', 'TRIP_COMPLETED'].includes(b.status)) throw forbidden('Cash can be collected only during or after the trip');
  const { amount } = body(req, z.object({ amount: z.coerce.number().positive().max(1_000_000) }));
  const p = await recordOfflinePayment(b.id, req.user!, amount, 'CASH');
  res.json(p);
});

r.get('/earnings', async (req, res) => {
  const drv = await currentDriver(req.user!.id);
  const rows = await prisma.driverAssignment.findMany({
    where: { driverId: drv.id, status: 'COMPLETED' },
    orderBy: { assignedAt: 'desc' },
    take: 200,
    include: { booking: { select: { bookingNumber: true, completedAt: true, pickupAt: true, returnAt: true, pickupAddress: true, dropAddress: true, extraCharges: true, vehicle: { select: { title: true } } } } },
  });
  const total = rows.reduce((a, r) => a + num(r.driverEarning), 0);
  res.json({ total: round2(total), trips: rows.length, rows });
});

export default r;

/** Drivers may view only their own documents. */
export const driverFileRoute = Router();
driverFileRoute.use(requireAuth, requireRole('DRIVER'));
driverFileRoute.get('/', async (req, res) => {
  const key = String(req.query.key ?? '');
  const drv = await currentDriver(req.user!.id);
  if (!(await prisma.driverDocument.count({ where: { driverId: drv.id, fileKey: key } }))) throw notFound('Document');
  const { privateFile } = await import('../../integrations/storage.js');
  const f = await privateFile(key);
  if (f.url) return res.redirect(f.url);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(f.localPath!);
});
