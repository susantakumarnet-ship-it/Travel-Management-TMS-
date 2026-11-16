import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, nullish } from '../../lib/prisma.js';
import { body, query, zPage, zPhone, zText } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requirePermission, ADMIN_MODULES } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { num, pageResult, paginate } from '../../lib/util.js';
import { notify } from '../notifications/service.js';
import { hashPassword } from '../auth/service.js';

const r = Router();

// ───────────────────── Customers ─────────────────────

r.get('/customers', requirePermission('customers:read'), async (req, res) => {
  const q = query(req, zPage.extend({ q: z.string().max(80).optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional() }));
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate(q.page, q.pageSize),
      select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true, lastLoginAt: true, _count: { select: { bookings: true } } },
    }),
  ]);
  const spend = await prisma.booking.groupBy({ by: ['customerId'], where: { customerId: { in: items.map((i) => i.id) } }, _sum: { paidAmount: true } });
  res.json(pageResult(items.map((i) => ({ ...i, totalPaid: num(spend.find((s) => s.customerId === i.id)?._sum.paidAmount) })), total, q.page, q.pageSize));
});

r.get('/customers/:id', requirePermission('customers:read'), async (req, res) => {
  const u = await prisma.user.findFirst({
    where: { id: req.params.id, role: 'CUSTOMER' },
    select: {
      id: true, name: true, phone: true, email: true, status: true, createdAt: true, lastLoginAt: true,
      customerProfile: true, addresses: true,
      bookings: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, bookingNumber: true, status: true, pickupAt: true, totalAmount: true, paidAmount: true, vehicle: { select: { title: true } } } },
      weddingRequests: { select: { id: true, requestNumber: true, weddingDate: true, status: true } },
      reviews: { select: { id: true, rating: true, comment: true, createdAt: true } },
    },
  });
  if (!u) throw notFound('Customer');
  res.json(u);
});

r.patch('/customers/:id/status', requirePermission('customers:write'), async (req, res) => {
  const { status } = body(req, z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }));
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
  if (status === 'SUSPENDED') await prisma.refreshToken.updateMany({ where: { userId: u.id, AND: [nullish('revokedAt')] }, data: { revokedAt: new Date() } });
  await audit(req, 'customer.status', 'User', u.id, { after: { status } });
  res.json({ ok: true });
});

// ───────────────────── Owners ─────────────────────

r.get('/owners', requirePermission('owners:read'), async (req, res) => {
  const q = query(req, zPage.extend({ q: z.string().max(80).optional(), kycStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }));
  const where: Prisma.VehicleOwnerWhereInput = {
    ...(q.kycStatus ? { kycStatus: q.kycStatus } : {}),
    ...(q.q ? { OR: [{ businessName: { contains: q.q, mode: 'insensitive' } }, { user: { phone: { contains: q.q } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.vehicleOwner.count({ where }),
    prisma.vehicleOwner.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate(q.page, q.pageSize),
      include: { user: { select: { name: true, phone: true, email: true, status: true } }, _count: { select: { vehicles: true, drivers: true, bookings: true } } },
    }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

/** Admin can onboard an owner directly (phone becomes their login). */
r.post('/owners', requirePermission('owners:write'), async (req, res) => {
  const d = body(req, z.object({ phone: zPhone, name: zText(120), email: z.string().email().optional().or(z.literal('')), businessName: zText(160).pipe(z.string().min(2)), city: zText(80).optional(), state: zText(80).optional(), commissionRate: z.coerce.number().min(0).max(100).optional() }));
  const existing = await prisma.user.findUnique({ where: { phone: d.phone } });
  if (existing) throw conflict('A user with this phone already exists');
  const u = await prisma.user.create({
    data: {
      phone: d.phone, name: d.name, email: d.email || null, role: 'OWNER', status: 'ACTIVE',
      owner: { create: { businessName: d.businessName, city: d.city, state: d.state, commissionRate: d.commissionRate, kycStatus: 'APPROVED' } },
    },
    include: { owner: true },
  });
  await audit(req, 'owner.create', 'VehicleOwner', u.owner!.id, { after: u.owner });
  res.status(201).json(u.owner);
});

r.get('/owners/:id', requirePermission('owners:read'), async (req, res) => {
  const o = await prisma.vehicleOwner.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { name: true, phone: true, email: true, status: true, createdAt: true } },
      documents: true,
      vehicles: { select: { id: true, title: true, registrationNumber: true, status: true } },
      drivers: { select: { id: true, verificationStatus: true, user: { select: { name: true, phone: true } } } },
      settlements: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!o) throw notFound('Owner');
  const agg = await prisma.booking.aggregate({ where: { ownerId: o.id, status: 'TRIP_COMPLETED' }, _sum: { finalAmount: true, commissionAmount: true, ownerPayout: true }, _count: true });
  const unsettled = await prisma.booking.aggregate({ where: { ownerId: o.id, status: 'TRIP_COMPLETED', AND: [nullish('settlementId')] }, _sum: { ownerPayout: true }, _count: true });
  res.json({ ...o, totals: { trips: agg._count, revenue: num(agg._sum.finalAmount), commission: num(agg._sum.commissionAmount), payout: num(agg._sum.ownerPayout), unsettled: num(unsettled._sum.ownerPayout), unsettledTrips: unsettled._count } });
});

r.patch('/owners/:id', requirePermission('owners:write'), async (req, res) => {
  const d = body(req, z.object({ kycStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), kycNote: zText(500).optional().nullable(), commissionRate: z.coerce.number().min(0).max(100).nullable().optional(), userStatus: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional() }));
  const before = await prisma.vehicleOwner.findUniqueOrThrow({ where: { id: req.params.id }, include: { user: true } });
  const o = await prisma.vehicleOwner.update({
    where: { id: req.params.id },
    data: {
      kycStatus: d.kycStatus,
      kycNote: d.kycNote,
      commissionRate: d.commissionRate,
      user: d.userStatus || d.kycStatus === 'APPROVED' ? { update: { status: d.userStatus ?? 'ACTIVE' } } : undefined,
    },
  });
  await audit(req, 'owner.update', 'VehicleOwner', o.id, { before, after: d });
  if (d.kycStatus && d.kycStatus !== before.kycStatus) {
    void notify({ userId: before.userId, phone: before.user.phone, email: before.user.email }, 'ADMIN_ALERT', {
      title: d.kycStatus === 'APPROVED' ? 'Partner account approved' : 'Partner KYC update',
      message: d.kycStatus === 'APPROVED' ? 'Your Royal Ride partner account is approved. Your approved vehicles can now receive bookings.' : `Your KYC status is ${d.kycStatus.toLowerCase()}. ${d.kycNote ?? ''}`,
    });
  }
  res.json(o);
});

r.patch('/owner-documents/:id', requirePermission('owners:write'), async (req, res) => {
  const { status, note } = body(req, z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'PENDING']), note: zText(300).optional() }));
  res.json(await prisma.ownerDocument.update({ where: { id: req.params.id }, data: { status, note } }));
});

// ───────────────────── Drivers ─────────────────────

r.get('/drivers', requirePermission('drivers:read'), async (req, res) => {
  const q = query(req, zPage.extend({ q: z.string().max(80).optional(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), ownerId: z.string().optional() }));
  const where: Prisma.DriverWhereInput = {
    ...(q.status ? { verificationStatus: q.status } : {}),
    ...(q.ownerId ? { ownerId: q.ownerId } : {}),
    ...(q.q ? { OR: [{ licenceNumber: { contains: q.q, mode: 'insensitive' } }, { user: { name: { contains: q.q, mode: 'insensitive' } } }, { user: { phone: { contains: q.q } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate(q.page, q.pageSize),
      include: { user: { select: { name: true, phone: true, status: true } }, owner: { select: { businessName: true } }, city: { select: { name: true } }, _count: { select: { bookings: { where: { status: 'TRIP_COMPLETED' } } } } },
    }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.get('/drivers/:id', requirePermission('drivers:read'), async (req, res) => {
  const d = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { name: true, phone: true, email: true, status: true, createdAt: true } },
      owner: { select: { id: true, businessName: true } },
      documents: { orderBy: { createdAt: 'desc' } },
      assignments: { orderBy: { assignedAt: 'desc' }, take: 50, include: { booking: { select: { id: true, bookingNumber: true, status: true, pickupAt: true } } } },
      reviews: { orderBy: { createdAt: 'desc' }, take: 20, select: { driverRating: true, comment: true, createdAt: true } },
    },
  });
  if (!d) throw notFound('Driver');
  res.json(d);
});

r.patch('/drivers/:id', requirePermission('drivers:write'), async (req, res) => {
  const d = body(req, z.object({ verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), verificationNote: zText(500).optional().nullable(), dailyWage: z.coerce.number().min(0).max(100000).optional(), ownerId: z.string().nullable().optional(), userStatus: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional() }));
  const before = await prisma.driver.findUniqueOrThrow({ where: { id: req.params.id }, include: { user: true } });
  if (d.verificationStatus === 'APPROVED' && before.licenceExpiry < new Date()) throw badRequest('Licence has expired');
  const drv = await prisma.driver.update({
    where: { id: req.params.id },
    data: {
      verificationStatus: d.verificationStatus,
      verificationNote: d.verificationNote,
      dailyWage: d.dailyWage,
      owner: d.ownerId === undefined ? undefined : d.ownerId === null ? { disconnect: true } : { connect: { id: d.ownerId } },
      user: d.userStatus || d.verificationStatus === 'APPROVED' ? { update: { status: d.userStatus ?? 'ACTIVE' } } : undefined,
    },
  });
  await audit(req, 'driver.update', 'Driver', drv.id, { before, after: d });
  if (d.verificationStatus && d.verificationStatus !== before.verificationStatus) {
    void notify({ userId: before.userId, phone: before.user.phone }, 'ADMIN_ALERT', {
      title: d.verificationStatus === 'APPROVED' ? 'You are verified!' : 'Verification update',
      message: d.verificationStatus === 'APPROVED' ? 'Your driver profile is verified. You can now receive trips.' : `Your verification status is ${d.verificationStatus.toLowerCase()}. ${d.verificationNote ?? ''}`,
    });
  }
  res.json(drv);
});

r.patch('/driver-documents/:id', requirePermission('drivers:write'), async (req, res) => {
  const { status, note } = body(req, z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'PENDING']), note: zText(300).optional() }));
  res.json(await prisma.driverDocument.update({ where: { id: req.params.id }, data: { status, note } }));
});

// ───────────────────── Admin users & roles ─────────────────────

r.get('/roles', requirePermission('roles:read'), async (_req, res) => {
  res.json({ modules: ADMIN_MODULES, roles: await prisma.adminRole.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } }) });
});
const roleSchema = z.object({ name: zText(60).pipe(z.string().min(2)), description: zText(300).optional(), permissions: z.array(z.string().regex(/^(\*|[a-z]+:(read|write))$/)).max(100) });
r.post('/roles', requirePermission('roles:write'), async (req, res) => {
  const role = await prisma.adminRole.create({ data: body(req, roleSchema) });
  await audit(req, 'role.create', 'AdminRole', role.id, { after: role });
  res.status(201).json(role);
});
r.put('/roles/:id', requirePermission('roles:write'), async (req, res) => {
  const before = await prisma.adminRole.findUniqueOrThrow({ where: { id: req.params.id } });
  if (before.isSystem) throw badRequest('System roles cannot be edited');
  const role = await prisma.adminRole.update({ where: { id: req.params.id }, data: body(req, roleSchema.partial()) });
  await audit(req, 'role.update', 'AdminRole', role.id, { before, after: role });
  res.json(role);
});
r.delete('/roles/:id', requirePermission('roles:write'), async (req, res) => {
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
  if (role.isSystem || role._count.users) throw conflict('Role is in use or is a system role');
  await prisma.adminRole.delete({ where: { id: role.id } });
  res.json({ ok: true });
});

r.get('/admins', requirePermission('roles:read'), async (_req, res) => {
  res.json(await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, name: true, email: true, phone: true, status: true, lastLoginAt: true, adminRole: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }));
});
const strongPw = z.string().min(10).regex(/[A-Z]/, 'Needs an uppercase letter').regex(/[a-z]/, 'Needs a lowercase letter').regex(/\d/, 'Needs a number');
r.post('/admins', requirePermission('roles:write'), async (req, res) => {
  const d = body(req, z.object({ name: zText(120), email: z.string().email(), phone: zPhone, password: strongPw, adminRoleId: z.string() }));
  const u = await prisma.user.create({ data: { name: d.name, email: d.email.toLowerCase(), phone: d.phone, role: 'ADMIN', status: 'ACTIVE', adminRoleId: d.adminRoleId, passwordHash: await hashPassword(d.password) } });
  await audit(req, 'admin.create', 'User', u.id, { after: { email: u.email, adminRoleId: d.adminRoleId } });
  res.status(201).json({ id: u.id });
});
r.put('/admins/:id', requirePermission('roles:write'), async (req, res) => {
  const d = body(req, z.object({ name: zText(120).optional(), adminRoleId: z.string().optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), password: strongPw.optional() }));
  if (req.params.id === req.user!.id && d.status === 'SUSPENDED') throw badRequest('You cannot suspend yourself');
  await prisma.user.update({ where: { id: req.params.id }, data: { name: d.name, adminRoleId: d.adminRoleId, status: d.status, passwordHash: d.password ? await hashPassword(d.password) : undefined } });
  if (d.status === 'SUSPENDED' || d.password) await prisma.refreshToken.updateMany({ where: { userId: req.params.id, AND: [nullish('revokedAt')] }, data: { revokedAt: new Date() } });
  await audit(req, 'admin.update', 'User', req.params.id, { after: { ...d, password: d.password ? '***' : undefined } });
  res.json({ ok: true });
});

export default r;
