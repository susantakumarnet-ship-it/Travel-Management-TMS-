import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, setAnd } from '../../lib/prisma.js';
import { body, query, zBoolish, zPage, zText } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/auth.js';
import { upload, storeUpload } from '../../middleware/upload.js';
import { audit } from '../../lib/audit.js';
import { pageResult, paginate, slugify } from '../../lib/util.js';
import { publicUrl } from '../../integrations/storage.js';
import { notify } from '../notifications/service.js';
import { addBlock, createVehicle, ownerVehicleInclude, removeBlock, removeImage, updateVehicle, vehicleSchema } from '../vehicles/service.js';

const r = Router();

// ───────────────────── Categories ─────────────────────

const categorySchema = z.object({
  name: zText(80).pipe(z.string().min(2)),
  slug: z.string().max(80).optional(),
  description: zText(1000).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  isWedding: z.boolean().default(false),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
});

r.get('/categories', requirePermission('categories:read'), async (_req, res) => {
  res.json(await prisma.vehicleCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { vehicles: true, models: true } } } }));
});
r.post('/categories', requirePermission('categories:write'), async (req, res) => {
  const d = body(req, categorySchema);
  const c = await prisma.vehicleCategory.create({ data: { ...d, slug: d.slug ? slugify(d.slug) : slugify(d.name) } });
  await audit(req, 'category.create', 'VehicleCategory', c.id, { after: c });
  res.status(201).json(c);
});
r.put('/categories/:id', requirePermission('categories:write'), async (req, res) => {
  const d = body(req, categorySchema.partial());
  const before = await prisma.vehicleCategory.findUniqueOrThrow({ where: { id: req.params.id } });
  const c = await prisma.vehicleCategory.update({ where: { id: req.params.id }, data: { ...d, slug: d.slug ? slugify(d.slug) : undefined } });
  await audit(req, 'category.update', 'VehicleCategory', c.id, { before, after: c });
  res.json(c);
});
r.delete('/categories/:id', requirePermission('categories:write'), async (req, res) => {
  const used = await prisma.vehicle.count({ where: { categoryId: req.params.id } });
  if (used) throw conflict(`Category has ${used} vehicles. Deactivate it instead.`);
  await prisma.vehicleModel.deleteMany({ where: { categoryId: req.params.id, vehicles: { none: {} } } });
  await prisma.vehicleCategory.delete({ where: { id: req.params.id } });
  await audit(req, 'category.delete', 'VehicleCategory', req.params.id);
  res.json({ ok: true });
});
r.post('/categories/:id/image', requirePermission('categories:write'), upload.single('image'), async (req, res) => {
  const key = await storeUpload(req.file, 'public', 'categories', false);
  const c = await prisma.vehicleCategory.update({ where: { id: req.params.id }, data: { imageUrl: key } });
  res.json({ ...c, imageUrl: publicUrl(key) });
});

// ───────────────────── Models ─────────────────────

const modelSchema = z.object({
  categoryId: z.string(),
  make: zText(60).pipe(z.string().min(1)),
  name: zText(80).pipe(z.string().min(1)),
  seats: z.coerce.number().int().min(1).max(60),
  luggageBags: z.coerce.number().int().min(0).max(40).default(2),
  fuelType: z.enum(['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID']).default('PETROL'),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']).default('MANUAL'),
  imageUrl: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});
r.get('/models', requirePermission('categories:read'), async (req, res) => {
  const { categoryId } = query(req, z.object({ categoryId: z.string().optional() }));
  res.json(await prisma.vehicleModel.findMany({ where: { categoryId }, orderBy: [{ make: 'asc' }, { name: 'asc' }], include: { category: { select: { name: true } }, _count: { select: { vehicles: true } } } }));
});
r.post('/models', requirePermission('categories:write'), async (req, res) => {
  const m = await prisma.vehicleModel.create({ data: body(req, modelSchema) });
  await audit(req, 'model.create', 'VehicleModel', m.id, { after: m });
  res.status(201).json(m);
});
r.put('/models/:id', requirePermission('categories:write'), async (req, res) => {
  res.json(await prisma.vehicleModel.update({ where: { id: req.params.id }, data: body(req, modelSchema.partial()) }));
});
r.delete('/models/:id', requirePermission('categories:write'), async (req, res) => {
  const used = await prisma.vehicle.count({ where: { modelId: req.params.id } });
  if (used) throw conflict('Model is in use; deactivate it instead.');
  await prisma.vehicleModel.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ───────────────────── Cities ─────────────────────

const citySchema = z.object({ name: zText(80).pipe(z.string().min(2)), state: zText(80).pipe(z.string().min(2)), lat: z.number().optional().nullable(), lng: z.number().optional().nullable(), isActive: z.boolean().default(true) });
r.get('/cities', requirePermission('categories:read'), async (_req, res) => {
  res.json(await prisma.city.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { vehicles: true, drivers: true } } } }));
});
r.post('/cities', requirePermission('categories:write'), async (req, res) => {
  const d = body(req, citySchema);
  res.status(201).json(await prisma.city.create({ data: { ...d, slug: slugify(`${d.name}`) } }));
});
r.put('/cities/:id', requirePermission('categories:write'), async (req, res) => {
  const d = body(req, citySchema.partial());
  res.json(await prisma.city.update({ where: { id: req.params.id }, data: { ...d, ...(d.name ? { slug: slugify(d.name) } : {}) } }));
});

// ───────────────────── Vehicles ─────────────────────

r.get('/vehicles', requirePermission('vehicles:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional(), categoryId: z.string().optional(), ownerId: z.string().optional(), cityId: z.string().optional(), q: z.string().max(80).optional(), expiring: zBoolish.optional() }));
  const soon = new Date(Date.now() + 30 * 86_400_000);
  const where: Prisma.VehicleWhereInput = {
    ...(q.status ? { status: q.status as Prisma.EnumVehicleStatusFilter['equals'] } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.ownerId ? { ownerId: q.ownerId } : {}),
    ...(q.cityId ? { cityId: q.cityId } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { registrationNumber: { contains: q.q.replace(/\s/g, ''), mode: 'insensitive' } }] } : {}),
    ...(q.expiring ? { OR: [setAnd('insuranceExpiry', { lte: soon }), setAnd('fitnessExpiry', { lte: soon }), setAnd('pollutionExpiry', { lte: soon }), setAnd('permitExpiry', { lte: soon })] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate(q.page, q.pageSize),
      include: { images: { take: 1, orderBy: { sortOrder: 'asc' } }, category: { select: { name: true } }, owner: { select: { businessName: true } }, city: { select: { name: true } }, _count: { select: { bookings: true } } },
    }),
  ]);
  res.json(pageResult(items.map((v) => ({ ...v, images: v.images.map((i) => ({ ...i, url: publicUrl(i.url) })) })), total, q.page, q.pageSize));
});

r.get('/vehicles/:id', requirePermission('vehicles:read'), async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include: { ...ownerVehicleInclude(), owner: { select: { id: true, businessName: true } } } });
  if (!v) throw notFound('Vehicle');
  const bookings = await prisma.booking.findMany({
    where: { vehicleId: v.id },
    orderBy: { pickupAt: 'desc' },
    take: 50,
    select: { id: true, bookingNumber: true, status: true, pickupAt: true, returnAt: true, totalAmount: true, finalAmount: true, customer: { select: { name: true } } },
  });
  res.json({ ...v, images: v.images.map((i) => ({ ...i, url: publicUrl(i.url) })), bookings });
});

r.post('/vehicles', requirePermission('vehicles:write'), async (req, res) => {
  const { ownerId, ...rest } = body(req, vehicleSchema.extend({ ownerId: z.string() }));
  const v = await createVehicle(ownerId, rest, { autoApprove: true });
  await audit(req, 'vehicle.create', 'Vehicle', v.id, { after: v });
  res.status(201).json(v);
});

r.put('/vehicles/:id', requirePermission('vehicles:write'), async (req, res) => {
  const d = body(req, vehicleSchema.partial().extend({ ownerId: z.string().optional(), isFeatured: z.boolean().optional() }));
  const before = await prisma.vehicle.findUniqueOrThrow({ where: { id: req.params.id } });
  const { ownerId, isFeatured, ...rest } = d;
  let v = await updateVehicle(req.params.id, null, rest, { isAdmin: true });
  if (ownerId || isFeatured !== undefined) v = await prisma.vehicle.update({ where: { id: v.id }, data: { ownerId, isFeatured } });
  await audit(req, 'vehicle.update', 'Vehicle', v.id, { before, after: v });
  res.json(v);
});

r.patch('/vehicles/:id/status', requirePermission('vehicles:write'), async (req, res) => {
  const { status, note } = body(req, z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'REJECTED', 'PENDING_APPROVAL']), note: zText(300).optional() }));
  const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: req.params.id }, include: { owner: { include: { user: true } } } });
  if (status === 'ACTIVE') {
    if (v.owner.kycStatus !== 'APPROVED') throw badRequest("Approve the owner's KYC first");
    const imgs = await prisma.vehicleImage.count({ where: { vehicleId: v.id } });
    if (!imgs) throw badRequest('Add at least one photo before activating');
  }
  const updated = await prisma.vehicle.update({ where: { id: v.id }, data: { status, statusNote: note } });
  await audit(req, 'vehicle.status', 'Vehicle', v.id, { before: { status: v.status }, after: { status, note } });
  if (v.status === 'PENDING_APPROVAL' && (status === 'ACTIVE' || status === 'REJECTED')) {
    void notify({ userId: v.owner.userId, phone: v.owner.user.phone }, 'ADMIN_ALERT', {
      title: status === 'ACTIVE' ? 'Vehicle approved' : 'Vehicle rejected',
      message: `${v.title} (${v.registrationNumber}) has been ${status === 'ACTIVE' ? 'approved and is now live' : `rejected${note ? `: ${note}` : ''}`}.`,
    }, ['IN_APP']);
  }
  res.json(updated);
});

r.post('/vehicles/:id/images', requirePermission('vehicles:write'), upload.array('images', 10), async (req, res) => {
  const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: req.params.id }, include: { _count: { select: { images: true } } } });
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw badRequest('Select at least one image');
  const out = [];
  for (const [i, f] of files.entries()) {
    const key = await storeUpload(f, 'public', `vehicles/${v.id}`, false);
    out.push(await prisma.vehicleImage.create({ data: { vehicleId: v.id, url: key, sortOrder: v._count.images + i, isPrimary: v._count.images === 0 && i === 0, alt: v.title } }));
  }
  res.status(201).json(out.map((x) => ({ ...x, url: publicUrl(x.url) })));
});
r.delete('/vehicles/:id/images/:imageId', requirePermission('vehicles:write'), async (req, res) => {
  await removeImage(req.params.id, req.params.imageId);
  res.json({ ok: true });
});
r.patch('/vehicles/:id/images/:imageId/primary', requirePermission('vehicles:write'), async (req, res) => {
  await prisma.$transaction([
    prisma.vehicleImage.updateMany({ where: { vehicleId: req.params.id }, data: { isPrimary: false } }),
    prisma.vehicleImage.update({ where: { id: req.params.imageId }, data: { isPrimary: true } }),
  ]);
  res.json({ ok: true });
});

r.patch('/vehicle-documents/:id', requirePermission('vehicles:write'), async (req, res) => {
  const { status, note } = body(req, z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'PENDING']), note: zText(300).optional() }));
  const d = await prisma.vehicleDocument.update({ where: { id: req.params.id }, data: { status, note } });
  await audit(req, 'vehicle_document.review', 'VehicleDocument', d.id, { after: { status, note } });
  res.json(d);
});

r.post('/vehicles/:id/blocks', requirePermission('vehicles:write'), async (req, res) => {
  const d = body(req, z.object({ type: z.enum(['MAINTENANCE', 'OWNER_BLOCK']), startAt: z.coerce.date(), endAt: z.coerce.date(), reason: zText(200).optional() }));
  const b = await addBlock(req.params.id, d.type, d.startAt, d.endAt, d.reason);
  await audit(req, 'vehicle.block', 'Vehicle', req.params.id, { after: b });
  res.status(201).json(b);
});
r.delete('/vehicles/:id/blocks/:blockId', requirePermission('vehicles:write'), async (req, res) => {
  await removeBlock(req.params.id, req.params.blockId);
  res.json({ ok: true });
});

export default r;
