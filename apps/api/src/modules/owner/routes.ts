import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, nullish, setAnd } from '../../lib/prisma.js';
import { body, query, zPage, zPhone, zText } from '../../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { upload, storeUpload } from '../../middleware/upload.js';
import { pageResult, paginate, round2, num, istMonthStart } from '../../lib/util.js';
import { notifyAdmins } from '../notifications/service.js';
import { assignDriver, bookingInclude, dispatchVehicle, getBookingForUser, ownerDecide } from '../bookings/service.js';
import { addBlock, createVehicle, ownerVehicleInclude, removeBlock, removeImage, updateVehicle, vehicleSchema } from '../vehicles/service.js';
import { publicUrl } from '../../integrations/storage.js';

const r = Router();

const ownerSchema = z.object({
  businessName: zText(160).pipe(z.string().min(2)),
  contactPerson: zText(120).optional(),
  name: zText(120).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: zText(300).optional(),
  city: zText(80).optional(),
  state: zText(80).optional(),
  panNumber: z.string().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN').optional().or(z.literal('')),
  gstin: z.string().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').optional().or(z.literal('')),
  bankAccountName: zText(120).optional(),
  bankAccountNumber: z.string().regex(/^\d{9,18}$/, 'Invalid account number').optional().or(z.literal('')),
  bankIfsc: z.string().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC').optional().or(z.literal('')),
  upiId: z.string().max(80).optional(),
});

r.use(requireAuth, requireRole('OWNER'));

/** Registration/profile can be submitted before KYC approval. */
r.post('/register', async (req, res) => {
  const d = body(req, ownerSchema);
  const { name, email, ...rest } = d;
  const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v])) as typeof rest;
  const owner = await prisma.vehicleOwner.upsert({
    where: { userId: req.user!.id },
    create: { ...clean, businessName: d.businessName, userId: req.user!.id },
    update: clean,
  });
  await prisma.user.update({ where: { id: req.user!.id }, data: { name: name || undefined, email: email ? email.toLowerCase() : undefined } });
  void notifyAdmins('New vehicle partner registration', `${owner.businessName} has registered and is awaiting KYC review.`);
  res.json(owner);
});

async function currentOwner(userId: string) {
  const o = await prisma.vehicleOwner.findUnique({ where: { userId } });
  if (!o) throw badRequest('Please complete your partner registration first');
  return o;
}

r.get('/profile', async (req, res) => {
  const o = await prisma.vehicleOwner.findUnique({ where: { userId: req.user!.id }, include: { documents: true, user: { select: { name: true, phone: true, email: true, status: true } } } });
  res.json(o);
});

r.put('/profile', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const d = body(req, ownerSchema.partial());
  const { name, email, ...rest } = d;
  const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]));
  // Bank detail changes need re-verification.
  const bankChanged = ['bankAccountNumber', 'bankIfsc'].some((k) => k in clean && (clean as Record<string, unknown>)[k] !== (o as Record<string, unknown>)[k]);
  const updated = await prisma.vehicleOwner.update({ where: { id: o.id }, data: { ...clean, ...(bankChanged && o.kycStatus === 'APPROVED' ? { kycNote: 'Bank details changed — pending verification' } : {}) } });
  if (name || email) await prisma.user.update({ where: { id: req.user!.id }, data: { name: name || undefined, email: email ? email.toLowerCase() : undefined } });
  res.json(updated);
});

r.post('/documents', upload.single('file'), async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { type, number } = z.object({ type: z.enum(['PAN', 'AADHAAR', 'BANK_PROOF', 'OTHER']), number: z.string().max(60).optional() }).parse(req.body);
  const fileKey = await storeUpload(req.file, 'private', `owners/${o.id}`);
  res.status(201).json(await prisma.ownerDocument.create({ data: { ownerId: o.id, type, number, fileKey } }));
});

// ───────────────────── Dashboard ─────────────────────

r.get('/dashboard', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const now = new Date();
  const monthStart = istMonthStart(now);
  const [vehicles, active, upcoming, pendingDecision, monthAgg, totalAgg, unsettled, docsExpiring] = await Promise.all([
    prisma.vehicle.count({ where: { ownerId: o.id } }),
    prisma.vehicle.count({ where: { ownerId: o.id, status: 'ACTIVE' } }),
    prisma.booking.count({ where: { ownerId: o.id, pickupAt: { gte: now }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED'] } } }),
    prisma.booking.count({ where: { ownerId: o.id, ownerDecision: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'] } } }),
    prisma.booking.aggregate({ where: { ownerId: o.id, status: 'TRIP_COMPLETED', completedAt: { gte: monthStart } }, _sum: { ownerPayout: true, commissionAmount: true, finalAmount: true }, _count: true }),
    prisma.booking.aggregate({ where: { ownerId: o.id, status: 'TRIP_COMPLETED' }, _sum: { ownerPayout: true, commissionAmount: true }, _count: true }),
    prisma.booking.aggregate({ where: { ownerId: o.id, status: 'TRIP_COMPLETED', AND: [nullish('settlementId')] }, _sum: { ownerPayout: true } }),
    prisma.vehicle.findMany({
      where: { ownerId: o.id, OR: (['insuranceExpiry', 'fitnessExpiry', 'pollutionExpiry', 'permitExpiry'] as const).map((f) => setAnd(f, { lte: new Date(now.getTime() + 30 * 86_400_000) })) },
      select: { id: true, title: true, registrationNumber: true, insuranceExpiry: true, fitnessExpiry: true, pollutionExpiry: true, permitExpiry: true },
    }),
  ]);
  const nextTrips = await prisma.booking.findMany({
    where: { ownerId: o.id, pickupAt: { gte: now }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'AWAITING_PAYMENT'] } },
    orderBy: { pickupAt: 'asc' },
    take: 5,
    include: { vehicle: { select: { title: true, registrationNumber: true } }, driver: { select: { user: { select: { name: true } } } } },
  });
  res.json({
    owner: o,
    stats: {
      vehicles,
      activeVehicles: active,
      upcomingTrips: upcoming,
      pendingDecision,
      monthTrips: monthAgg._count,
      monthEarnings: num(monthAgg._sum.ownerPayout),
      monthCommission: num(monthAgg._sum.commissionAmount),
      totalEarnings: num(totalAgg._sum.ownerPayout),
      totalCommission: num(totalAgg._sum.commissionAmount),
      totalTrips: totalAgg._count,
      unsettled: num(unsettled._sum.ownerPayout),
    },
    nextTrips,
    docsExpiring,
  });
});

// ───────────────────── Vehicles ─────────────────────

r.get('/vehicles', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const vs = await prisma.vehicle.findMany({ where: { ownerId: o.id }, include: ownerVehicleInclude(), orderBy: { createdAt: 'desc' } });
  res.json(vs.map((v) => ({ ...v, images: v.images.map((i) => ({ ...i, url: publicUrl(i.url) })) })));
});

r.get('/vehicles/:id', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id }, include: ownerVehicleInclude() });
  if (!v) throw notFound('Vehicle');
  res.json({ ...v, images: v.images.map((i) => ({ ...i, url: publicUrl(i.url) })) });
});

r.post('/vehicles', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const d = body(req, vehicleSchema);
  const v = await createVehicle(o.id, d);
  void notifyAdmins('Vehicle awaiting approval', `${o.businessName} added ${d.title} (${d.registrationNumber}).`);
  res.status(201).json(v);
});

r.put('/vehicles/:id', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const d = body(req, vehicleSchema.partial());
  res.json(await updateVehicle(req.params.id, o.id, d));
});

r.patch('/vehicles/:id/status', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { status, note } = body(req, z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']), note: zText(300).optional() }));
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!v) throw notFound('Vehicle');
  if (v.status === 'PENDING_APPROVAL' || v.status === 'REJECTED') throw conflict('This vehicle is awaiting admin approval');
  if (status !== 'ACTIVE') {
    const future = await prisma.booking.count({ where: { vehicleId: v.id, pickupAt: { gte: new Date() }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED'] } } });
    if (future) throw conflict(`This vehicle has ${future} upcoming confirmed booking(s). Use a date-range block instead, or contact support to reassign them.`);
  }
  res.json(await prisma.vehicle.update({ where: { id: v.id }, data: { status, statusNote: note } }));
});

r.post('/vehicles/:id/images', upload.array('images', 10), async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id }, include: { _count: { select: { images: true } } } });
  if (!v) throw notFound('Vehicle');
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw badRequest('Select at least one image');
  if (v._count.images + files.length > 15) throw badRequest('A vehicle can have at most 15 photos');
  const created = [];
  for (const [i, f] of files.entries()) {
    const key = await storeUpload(f, 'public', `vehicles/${v.id}`, false);
    created.push(await prisma.vehicleImage.create({ data: { vehicleId: v.id, url: key, sortOrder: v._count.images + i, isPrimary: v._count.images === 0 && i === 0, alt: v.title } }));
  }
  res.status(201).json(created.map((c) => ({ ...c, url: publicUrl(c.url) })));
});

r.delete('/vehicles/:id/images/:imageId', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!v) throw notFound('Vehicle');
  await removeImage(v.id, req.params.imageId);
  res.json({ ok: true });
});

r.post('/vehicles/:id/documents', upload.single('file'), async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!v) throw notFound('Vehicle');
  const d = z
    .object({ type: z.enum(['RC', 'INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'OTHER']), number: z.string().max(60).optional(), expiresAt: z.coerce.date().optional() })
    .parse(req.body);
  const fileKey = await storeUpload(req.file, 'private', `vehicles/${v.id}/docs`);
  const doc = await prisma.vehicleDocument.create({ data: { vehicleId: v.id, ...d, fileKey } });
  // Keep the vehicle's compliance dates in sync with the latest upload.
  const field = { INSURANCE: 'insuranceExpiry', FITNESS: 'fitnessExpiry', PUC: 'pollutionExpiry', PERMIT: 'permitExpiry' }[d.type as string];
  if (field && d.expiresAt) await prisma.vehicle.update({ where: { id: v.id }, data: { [field]: d.expiresAt, ...(d.type === 'PERMIT' && d.number ? { permitNumber: d.number } : {}) } });
  res.status(201).json(doc);
});

r.post('/vehicles/:id/blocks', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!v) throw notFound('Vehicle');
  const d = body(req, z.object({ type: z.enum(['MAINTENANCE', 'OWNER_BLOCK']), startAt: z.coerce.date(), endAt: z.coerce.date(), reason: zText(200).optional() }));
  res.status(201).json(await addBlock(v.id, d.type, d.startAt, d.endAt, d.reason));
});

r.delete('/vehicles/:id/blocks/:blockId', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!v) throw notFound('Vehicle');
  await removeBlock(v.id, req.params.blockId);
  res.json({ ok: true });
});

// ───────────────────── Bookings ─────────────────────

r.get('/bookings', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const q = query(req, zPage.extend({ status: z.string().optional(), scope: z.enum(['pending', 'upcoming', 'past', 'all']).default('all'), vehicleId: z.string().optional() }));
  const now = new Date();
  const where: Prisma.BookingWhereInput = {
    ownerId: o.id,
    ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
    ...(q.status ? { status: q.status as Prisma.EnumBookingStatusFilter['equals'] } : {}),
    ...(q.scope === 'pending' ? { ownerDecision: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'] } } : {}),
    ...(q.scope === 'upcoming' ? { pickupAt: { gte: now }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'AWAITING_PAYMENT'] } } : {}),
    ...(q.scope === 'past' ? { OR: [{ status: { in: ['TRIP_COMPLETED', 'CANCELLED', 'REFUNDED', 'REFUND_INITIATED'] } }, { returnAt: { lt: now } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { pickupAt: q.scope === 'upcoming' || q.scope === 'pending' ? 'asc' : 'desc' },
      ...paginate(q.page, q.pageSize),
      include: {
        vehicle: { select: { id: true, title: true, registrationNumber: true } },
        customer: { select: { name: true, phone: true } },
        driver: { select: { id: true, user: { select: { name: true, phone: true } } } },
      },
    }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/bookings/:id', async (req, res) => {
  res.json(await getBookingForUser(req.params.id, req.user!));
});

r.post('/bookings/:id/decision', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { accept, note } = body(req, z.object({ accept: z.boolean(), note: zText(500).optional() }));
  res.json(await ownerDecide(req.params.id, req.user!, o.id, accept, note));
});

r.post('/bookings/:id/assign-driver', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { driverId } = body(req, z.object({ driverId: z.string() }));
  await assignDriver(req.params.id, driverId, req.user!, o.id);
  res.json(await prisma.booking.findUnique({ where: { id: req.params.id }, include: bookingInclude }));
});

r.post('/bookings/:id/dispatch', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const b = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!b || b.ownerId !== o.id) throw notFound('Booking');
  await dispatchVehicle(b.id, req.user!);
  res.json({ ok: true });
});

// ───────────────────── Fleet drivers ─────────────────────

r.get('/drivers', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  res.json(
    await prisma.driver.findMany({
      where: { ownerId: o.id },
      include: { user: { select: { name: true, phone: true, status: true } }, _count: { select: { bookings: { where: { status: 'TRIP_COMPLETED' } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  );
});

/** Link an already-registered driver (by phone) to this owner's fleet. */
r.post('/drivers/link', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { phone } = body(req, z.object({ phone: zPhone }));
  const u = await prisma.user.findUnique({ where: { phone }, include: { driver: true } });
  if (!u?.driver) throw notFound('No registered driver with this number. Ask the driver to sign up in the driver portal first.');
  if (u.driver.ownerId && u.driver.ownerId !== o.id) throw conflict('This driver is already linked to another partner');
  res.json(await prisma.driver.update({ where: { id: u.driver.id }, data: { ownerId: o.id } }));
});

r.delete('/drivers/:id', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const d = await prisma.driver.findFirst({ where: { id: req.params.id, ownerId: o.id } });
  if (!d) throw notFound('Driver');
  const active = await prisma.booking.count({ where: { driverId: d.id, status: { in: ['DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED'] } } });
  if (active) throw conflict('Driver has active trips');
  await prisma.$transaction([
    prisma.vehicle.updateMany({ where: { ownerId: o.id, defaultDriverId: d.id }, data: { defaultDriverId: null } }),
    prisma.driver.update({ where: { id: d.id }, data: { ownerId: null } }),
  ]);
  res.json({ ok: true });
});

/** Drivers available for a booking: own fleet + platform drivers, verified, free in the booking window. */
r.get('/bookings/:id/available-drivers', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const b = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!b || b.ownerId !== o.id) throw forbidden();
  const drivers = await prisma.driver.findMany({
    where: {
      verificationStatus: 'APPROVED',
      user: { status: 'ACTIVE' },
      licenceExpiry: { gte: b.returnAt },
      OR: [{ ownerId: o.id }, ...nullish('ownerId').OR],
      bookings: { none: { id: { not: b.id }, status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED'] }, pickupAt: { lt: b.returnAt }, returnAt: { gt: b.pickupAt } } },
    },
    include: { user: { select: { name: true, phone: true } } },
    orderBy: [{ ratingAvg: 'desc' }],
  });
  res.json(drivers);
});

// ───────────────────── Earnings & settlements ─────────────────────

r.get('/earnings', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const q = query(req, z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }));
  const where: Prisma.BookingWhereInput = { ownerId: o.id, status: 'TRIP_COMPLETED', completedAt: { gte: q.from, lte: q.to } };
  const [rows, agg] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      take: 200,
      select: { id: true, bookingNumber: true, completedAt: true, finalAmount: true, taxAmount: true, commissionRate: true, commissionAmount: true, ownerPayout: true, settlementId: true, vehicle: { select: { title: true, registrationNumber: true } } },
    }),
    prisma.booking.aggregate({ where, _sum: { finalAmount: true, commissionAmount: true, ownerPayout: true, taxAmount: true }, _count: true }),
  ]);
  res.json({
    summary: {
      trips: agg._count,
      gross: round2(num(agg._sum.finalAmount)),
      gst: round2(num(agg._sum.taxAmount)),
      commission: round2(num(agg._sum.commissionAmount)),
      payout: round2(num(agg._sum.ownerPayout)),
    },
    rows,
  });
});

r.get('/settlements', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  res.json(await prisma.ownerSettlement.findMany({ where: { ownerId: o.id }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { bookings: true } } } }));
});

r.post('/reviews/:id/reply', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  const { reply } = body(req, z.object({ reply: zText(1000).pipe(z.string().min(2)) }));
  const rv = await prisma.review.findUnique({ where: { id: req.params.id }, include: { vehicle: true } });
  if (!rv || rv.vehicle.ownerId !== o.id) throw notFound('Review');
  res.json(await prisma.review.update({ where: { id: rv.id }, data: { ownerReply: reply } }));
});

r.get('/reviews', async (req, res) => {
  const o = await currentOwner(req.user!.id);
  res.json(await prisma.review.findMany({ where: { vehicle: { ownerId: o.id } }, orderBy: { createdAt: 'desc' }, take: 100, include: { vehicle: { select: { title: true } }, customer: { select: { name: true } } } }));
});

export default r;

/** Owners may view only their own KYC docs and their vehicles' documents. */
export const ownerFileRoute = Router();
ownerFileRoute.use(requireAuth, requireRole('OWNER'));
ownerFileRoute.get('/', async (req, res) => {
  const key = String(req.query.key ?? '');
  const o = await currentOwner(req.user!.id);
  const owns =
    (await prisma.ownerDocument.count({ where: { ownerId: o.id, fileKey: key } })) +
    (await prisma.vehicleDocument.count({ where: { fileKey: key, vehicle: { ownerId: o.id } } }));
  if (!owns) throw notFound('Document');
  const { privateFile } = await import('../../integrations/storage.js');
  const f = await privateFile(key);
  if (f.url) return res.redirect(f.url);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(f.localPath!);
});
