import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { body, query, zPage, zText } from '../../lib/validate.js';
import { badRequest } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/auth.js';
import { upload, storeUpload } from '../../middleware/upload.js';
import { audit } from '../../lib/audit.js';
import { pageResult, paginate, round2, slugify, shortId } from '../../lib/util.js';
import { publicUrl } from '../../integrations/storage.js';
import { getSettings, invalidateSettings, SETTING_DEFAULTS, type SettingKey } from '../../lib/settings.js';
import { notify } from '../notifications/service.js';

const r = Router();

/** Generic image upload for CMS-managed content. Returns { key, url }. */
r.post('/uploads/image', requirePermission('content:write'), upload.single('image'), async (req, res) => {
  const key = await storeUpload(req.file, 'public', 'content', false);
  res.status(201).json({ key, url: publicUrl(key) });
});

// ───────────────────── Wedding packages ─────────────────────

const weddingPkg = z.object({
  name: zText(80).pipe(z.string().min(2)),
  tier: z.enum(['SILVER', 'GOLD', 'PREMIUM', 'LUXURY']),
  tagline: zText(160).optional().nullable(),
  description: zText(4000).optional().nullable(),
  basePrice: z.coerce.number().min(0),
  includedHours: z.coerce.number().int().min(1).max(48),
  includedKm: z.coerce.number().int().min(0).max(2000),
  vehicleCount: z.coerce.number().int().min(1).max(100),
  extraHourRate: z.coerce.number().min(0).default(0),
  extraKmRate: z.coerce.number().min(0).default(0),
  decorationIncluded: z.boolean().default(true),
  inclusions: z.array(zText(160)).max(30).default([]),
  vehicleHighlights: z.array(zText(160)).max(20).default([]),
  imageUrl: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
r.get('/wedding-packages', requirePermission('packages:read'), async (_req, res) => {
  res.json(await prisma.weddingPackage.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { requests: true } } } }));
});
r.post('/wedding-packages', requirePermission('packages:write'), async (req, res) => {
  const d = body(req, weddingPkg);
  const p = await prisma.weddingPackage.create({ data: { ...d, slug: `${slugify(d.name)}-${shortId()}` } });
  await audit(req, 'wedding_package.create', 'WeddingPackage', p.id, { after: p });
  res.status(201).json(p);
});
r.put('/wedding-packages/:id', requirePermission('packages:write'), async (req, res) => {
  const p = await prisma.weddingPackage.update({ where: { id: req.params.id }, data: body(req, weddingPkg.partial()) });
  await audit(req, 'wedding_package.update', 'WeddingPackage', p.id, { after: p });
  res.json(p);
});
r.delete('/wedding-packages/:id', requirePermission('packages:write'), async (req, res) => {
  await prisma.weddingPackage.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true, deactivated: true });
});

// ───────────────────── Travel packages ─────────────────────

const travelPkg = z.object({
  title: zText(160).pipe(z.string().min(3)),
  type: z.enum(['ODISHA_TOUR', 'CITY_SIGHTSEEING', 'FAMILY_VACATION', 'WEEKEND_TRIP', 'OUTSTATION', 'CUSTOM']),
  destination: zText(120).pipe(z.string().min(2)),
  startCity: zText(80).default('Bhubaneswar'),
  durationDays: z.coerce.number().int().min(1).max(30),
  durationNights: z.coerce.number().int().min(0).max(30).default(0),
  summary: zText(300).optional().nullable(),
  description: zText(8000).optional().nullable(),
  highlights: z.array(zText(160)).max(20).default([]),
  inclusions: z.array(zText(160)).max(30).default([]),
  exclusions: z.array(zText(160)).max(30).default([]),
  basePrice: z.coerce.number().min(0),
  estimatedKm: z.coerce.number().int().min(0).max(10000).default(0),
  minPassengers: z.coerce.number().int().min(1).max(60).default(1),
  maxPassengers: z.coerce.number().int().min(1).max(60).default(7),
  recommendedCategoryId: z.string().optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  gallery: z.array(z.string().max(500)).max(20).default([]),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  itinerary: z.array(z.object({ dayNumber: z.coerce.number().int().min(1), title: zText(160), description: zText(2000).optional().nullable(), places: z.array(zText(80)).max(20).default([]) })).max(30).default([]),
});
r.get('/travel-packages', requirePermission('packages:read'), async (_req, res) => {
  res.json(await prisma.travelPackage.findMany({ orderBy: { createdAt: 'desc' }, include: { itinerary: { orderBy: { dayNumber: 'asc' } }, recommendedCategory: { select: { name: true } }, _count: { select: { bookings: true } } } }));
});
r.post('/travel-packages', requirePermission('packages:write'), async (req, res) => {
  const { itinerary, ...d } = body(req, travelPkg);
  if (d.maxPassengers < d.minPassengers) throw badRequest('Max passengers must be ≥ min passengers');
  const p = await prisma.travelPackage.create({ data: { ...d, slug: `${slugify(d.title)}-${shortId()}`, itinerary: { create: itinerary } } });
  await audit(req, 'travel_package.create', 'TravelPackage', p.id, { after: p });
  res.status(201).json(p);
});
r.put('/travel-packages/:id', requirePermission('packages:write'), async (req, res) => {
  const { itinerary, ...d } = body(req, travelPkg);
  const p = await prisma.$transaction(async (tx) => {
    await tx.travelItinerary.deleteMany({ where: { packageId: req.params.id } });
    return tx.travelPackage.update({ where: { id: req.params.id }, data: { ...d, itinerary: { create: itinerary } } });
  });
  await audit(req, 'travel_package.update', 'TravelPackage', p.id, { after: p });
  res.json(p);
});
r.patch('/travel-packages/:id/publish', requirePermission('packages:write'), async (req, res) => {
  const { isPublished } = body(req, z.object({ isPublished: z.boolean() }));
  res.json(await prisma.travelPackage.update({ where: { id: req.params.id }, data: { isPublished } }));
});
r.delete('/travel-packages/:id', requirePermission('packages:write'), async (req, res) => {
  const used = await prisma.booking.count({ where: { travelPackageId: req.params.id } });
  if (used) {
    await prisma.travelPackage.update({ where: { id: req.params.id }, data: { isPublished: false } });
    return res.json({ ok: true, unpublished: true });
  }
  await prisma.travelPackage.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ───────────────────── CMS: pages, blocks, testimonials, destinations ─────────────────────

r.get('/pages', requirePermission('content:read'), async (_req, res) => res.json(await prisma.page.findMany({ orderBy: { slug: 'asc' } })));
const pageSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), title: zText(160), body: z.string().max(100_000), metaTitle: zText(160).optional().nullable(), metaDescription: zText(300).optional().nullable(), isPublished: z.boolean().default(true) });
r.put('/pages/:slug', requirePermission('content:write'), async (req, res) => {
  // Page bodies are Markdown; the web renderer escapes raw HTML.
  const d = body(req, pageSchema);
  const p = await prisma.page.upsert({ where: { slug: req.params.slug }, create: d, update: d });
  await audit(req, 'page.upsert', 'Page', p.id);
  res.json(p);
});

r.get('/blocks', requirePermission('content:read'), async (_req, res) => res.json(await prisma.contentBlock.findMany()));
r.put('/blocks/:key', requirePermission('content:write'), async (req, res) => {
  const { data } = body(req, z.object({ data: z.record(z.string(), z.unknown()) }));
  const b = await prisma.contentBlock.upsert({ where: { key: req.params.key }, create: { key: req.params.key, data: data as Prisma.InputJsonValue }, update: { data: data as Prisma.InputJsonValue } });
  await audit(req, 'content_block.upsert', 'ContentBlock', b.key);
  res.json(b);
});

const testimonialSchema = z.object({ name: zText(120), location: zText(80).optional().nullable(), occasion: zText(80).optional().nullable(), rating: z.coerce.number().int().min(1).max(5).default(5), quote: zText(1000), avatarUrl: z.string().max(500).optional().nullable(), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0) });
r.get('/testimonials', requirePermission('content:read'), async (_req, res) => res.json(await prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } })));
r.post('/testimonials', requirePermission('content:write'), async (req, res) => res.status(201).json(await prisma.testimonial.create({ data: body(req, testimonialSchema) })));
r.put('/testimonials/:id', requirePermission('content:write'), async (req, res) => res.json(await prisma.testimonial.update({ where: { id: req.params.id }, data: body(req, testimonialSchema.partial()) })));
r.delete('/testimonials/:id', requirePermission('content:write'), async (req, res) => {
  await prisma.testimonial.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

const destSchema = z.object({ name: zText(120), state: zText(80), tagline: zText(160).optional().nullable(), imageUrl: z.string().max(500).optional().nullable(), distanceKm: z.coerce.number().int().min(0).optional().nullable(), startingFare: z.coerce.number().min(0).optional().nullable(), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0) });
r.get('/destinations', requirePermission('content:read'), async (_req, res) => res.json(await prisma.destination.findMany({ orderBy: { sortOrder: 'asc' } })));
r.post('/destinations', requirePermission('content:write'), async (req, res) => {
  const d = body(req, destSchema);
  res.status(201).json(await prisma.destination.create({ data: { ...d, slug: `${slugify(d.name)}-${shortId()}` } }));
});
r.put('/destinations/:id', requirePermission('content:write'), async (req, res) => res.json(await prisma.destination.update({ where: { id: req.params.id }, data: body(req, destSchema.partial()) })));
r.delete('/destinations/:id', requirePermission('content:write'), async (req, res) => {
  await prisma.destination.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ───────────────────── Reviews moderation ─────────────────────

r.get('/reviews', requirePermission('reviews:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.enum(['PUBLISHED', 'HIDDEN']).optional(), maxRating: z.coerce.number().int().min(1).max(5).optional() }));
  const where: Prisma.ReviewWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.maxRating ? { rating: { lte: q.maxRating } } : {}) };
  const [total, items] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { customer: { select: { name: true, phone: true } }, vehicle: { select: { title: true } }, booking: { select: { bookingNumber: true } }, driver: { select: { user: { select: { name: true } } } } } }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});
r.patch('/reviews/:id', requirePermission('reviews:write'), async (req, res) => {
  const { status } = body(req, z.object({ status: z.enum(['PUBLISHED', 'HIDDEN']) }));
  const rv = await prisma.review.update({ where: { id: req.params.id }, data: { status } });
  const agg = await prisma.review.aggregate({ where: { vehicleId: rv.vehicleId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: true });
  await prisma.vehicle.update({ where: { id: rv.vehicleId }, data: { ratingAvg: round2(agg._avg.rating ?? 0), ratingCount: agg._count } });
  await audit(req, 'review.moderate', 'Review', rv.id, { after: { status } });
  res.json(rv);
});

// ───────────────────── Notifications ─────────────────────

r.get('/notifications', requirePermission('notifications:read'), async (req, res) => {
  const q = query(req, zPage.extend({ channel: z.string().optional(), status: z.string().optional(), event: z.string().optional() }));
  const where: Prisma.NotificationWhereInput = {
    ...(q.channel ? { channel: q.channel as Prisma.EnumNotificationChannelFilter['equals'] } : { channel: { not: 'IN_APP' } }),
    ...(q.status ? { status: q.status as Prisma.EnumNotificationStatusFilter['equals'] } : {}),
    ...(q.event ? { event: q.event } : {}),
  };
  const [total, items] = await Promise.all([prisma.notification.count({ where }), prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize) })]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

/** Broadcast an in-app (+ optional SMS) announcement to a role. */
r.post('/notifications/broadcast', requirePermission('notifications:write'), async (req, res) => {
  const d = body(req, z.object({ role: z.enum(['CUSTOMER', 'OWNER', 'DRIVER']), title: zText(120).pipe(z.string().min(2)), message: zText(500).pipe(z.string().min(2)), sms: z.boolean().default(false) }));
  const users = await prisma.user.findMany({ where: { role: d.role, status: 'ACTIVE' }, select: { id: true, phone: true }, take: 5000 });
  for (const u of users) await notify({ userId: u.id, phone: u.phone }, 'ADMIN_ALERT', { title: d.title, message: d.message }, d.sms ? ['IN_APP', 'SMS'] : ['IN_APP']);
  await audit(req, 'notification.broadcast', 'Notification', null, { after: { ...d, recipients: users.length } });
  res.json({ sent: users.length });
});

// ───────────────────── Settings & audit ─────────────────────

r.get('/settings', requirePermission('settings:read'), async (_req, res) => {
  res.json({ values: await getSettings(), defaults: SETTING_DEFAULTS });
});
r.put('/settings', requirePermission('settings:write'), async (req, res) => {
  const d = body(req, z.record(z.string(), z.unknown()));
  const before = await getSettings();
  const allowed = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  for (const [k, v] of Object.entries(d)) {
    if (!allowed.includes(k as SettingKey)) throw badRequest(`Unknown setting ${k}`);
    const def = SETTING_DEFAULTS[k as SettingKey];
    if (typeof def !== typeof v || Array.isArray(def) !== Array.isArray(v)) throw badRequest(`Invalid value type for ${k}`);
    if (typeof v === 'number' && (v < 0 || !Number.isFinite(v))) throw badRequest(`${k} must be a positive number`);
  }
  if (d['cancellation.tiers']) {
    const tiers = z.array(z.object({ hoursBefore: z.number().min(0), refundPercent: z.number().min(0).max(100) })).min(1).parse(d['cancellation.tiers']);
    d['cancellation.tiers'] = tiers;
  }
  await prisma.$transaction(Object.entries(d).map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } })));
  invalidateSettings();
  await audit(req, 'settings.update', 'Setting', null, { before: Object.fromEntries(Object.keys(d).map((k) => [k, before[k as SettingKey]])), after: d });
  res.json({ values: await getSettings() });
});

r.get('/audit-logs', requirePermission('audit:read'), async (req, res) => {
  const q = query(req, zPage.extend({ entity: z.string().optional(), actorId: z.string().optional(), action: z.string().optional() }));
  const where: Prisma.AuditLogWhereInput = { ...(q.entity ? { entity: q.entity } : {}), ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.action ? { action: { contains: q.action } } : {}) };
  const [total, items] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { actor: { select: { name: true, email: true, role: true } } } })]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

export default r;
