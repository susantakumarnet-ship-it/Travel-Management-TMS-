import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, isObjectId, nullish, setAnd } from '../../lib/prisma.js';
import { body, query, zBoolish, zPhone, zText } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { optionalAuth } from '../../middleware/auth.js';
import { getSettings } from '../../lib/settings.js';
import { pageResult, paginate } from '../../lib/util.js';
import { env } from '../../config/env.js';
import { publicUrl } from '../../integrations/storage.js';
import { roadDistance } from '../../integrations/maps.js';
import { blockWindow, liveBlockWhere, vehicleCalendar } from '../availability/service.js';
import { calculateQuote } from '../pricing/engine.js';
import { loadPricingRules, pricingSettings, quoteForVehicle, vehicleRates } from '../pricing/service.js';
import { publicVehicleInclude, serializePublicVehicle } from '../vehicles/serialize.js';
import { notifyAdmins } from '../notifications/service.js';

const r = Router();

const PURPOSES = ['WEDDING', 'FAMILY_TRIP', 'BUSINESS', 'AIRPORT_TRANSFER', 'LOCAL_TRAVEL', 'OUTSTATION', 'OTHER'] as const;
const TRIP_TYPES = ['LOCAL_HOURLY', 'OUTSTATION', 'AIRPORT_TRANSFER', 'MULTI_DAY', 'SELF_DRIVE'] as const;

/** Maps a travel purpose to the most natural fare model when the client does not specify one. */
export function defaultTripType(purpose: (typeof PURPOSES)[number], hours: number, withDriver: boolean): (typeof TRIP_TYPES)[number] {
  if (!withDriver) return 'SELF_DRIVE';
  if (purpose === 'AIRPORT_TRANSFER') return 'AIRPORT_TRANSFER';
  if (purpose === 'OUTSTATION') return 'OUTSTATION';
  return hours > 12 ? 'MULTI_DAY' : 'LOCAL_HOURLY';
}

// ───────────────────── Site config & CMS ─────────────────────

r.get('/config', async (_req, res) => {
  const s = await getSettings();
  const blocks = await prisma.contentBlock.findMany({ where: { key: { in: ['home.hero', 'home.why', 'home.stats', 'footer'] } } });
  res.json({
    contact: { phone: s['contact.phone'], email: s['contact.email'], whatsapp: s['contact.whatsapp'] || env.WHATSAPP_PUBLIC_NUMBER, address: s['contact.address'] },
    company: { name: env.COMPANY_NAME, gstin: env.COMPANY_GSTIN },
    booking: { advancePercent: s['booking.advancePercent'], holdMinutes: s['booking.holdMinutes'], minLeadHours: s['booking.minLeadHours'] },
    cancellationTiers: s['cancellation.tiers'],
    gstPercent: s['tax.gstPercent'],
    content: Object.fromEntries(blocks.map((b) => [b.key, b.data])),
  });
});

r.get('/cities', async (_req, res) => {
  res.json(await prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
});

r.get('/categories', async (_req, res) => {
  const cats = await prisma.vehicleCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { vehicles: { where: { status: 'ACTIVE' } } } } },
  });
  const mins = await prisma.vehicle.groupBy({ by: ['categoryId'], where: { status: 'ACTIVE' }, _min: { perDayRate: true, perKmRate: true } });
  res.json(
    cats.map((c) => {
      const m = mins.find((x) => x.categoryId === c.id);
      return { ...c, imageUrl: c.imageUrl ? publicUrl(c.imageUrl) : null, vehicleCount: c._count.vehicles, fromPerDay: m?._min.perDayRate ?? null, fromPerKm: m?._min.perKmRate ?? null };
    }),
  );
});

r.get('/models', async (req, res) => {
  const { categoryId } = query(req, z.object({ categoryId: z.string().optional() }));
  res.json(
    await prisma.vehicleModel.findMany({
      where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ make: 'asc' }, { name: 'asc' }],
      select: { id: true, make: true, name: true, categoryId: true, seats: true, luggageBags: true, fuelType: true, transmission: true },
    }),
  );
});

r.get('/testimonials', async (_req, res) => {
  res.json(await prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }));
});

r.get('/destinations', async (_req, res) => {
  const d = await prisma.destination.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json(d.map((x) => ({ ...x, imageUrl: x.imageUrl ? publicUrl(x.imageUrl) : null })));
});

r.get('/offers', async (_req, res) => {
  const now = new Date();
  res.json(
    await prisma.coupon.findMany({
      where: { isActive: true, isFeatured: true, validFrom: { lte: now }, validTo: { gte: now } },
      select: { id: true, code: true, title: true, description: true, discountType: true, value: true, maxDiscount: true, minOrderAmount: true, validTo: true, purposes: true },
      orderBy: { validTo: 'asc' },
    }),
  );
});

r.get('/pages/:slug', async (req, res) => {
  const p = await prisma.page.findUnique({ where: { slug: req.params.slug } });
  if (!p || !p.isPublished) throw notFound('Page');
  res.json(p);
});

r.get('/reviews/recent', async (_req, res) => {
  res.json(
    await prisma.review.findMany({
      where: { status: 'PUBLISHED', rating: { gte: 4 }, AND: [setAnd('comment', {})] },
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } }, vehicle: { select: { title: true } } },
    }),
  );
});

// ───────────────────── Vehicle search ─────────────────────

const searchSchema = z.object({
  city: z.string().optional(),
  pickupLocation: z.string().max(300).optional(),
  dropLocation: z.string().max(300).optional(),
  pickupAt: z.coerce.date().optional(),
  returnAt: z.coerce.date().optional(),
  purpose: z.enum(PURPOSES).optional(),
  tripType: z.enum(TRIP_TYPES).optional(),
  category: z.string().optional(),
  passengers: z.coerce.number().int().min(1).max(60).optional(),
  luggage: z.coerce.number().int().min(0).max(40).optional(),
  ac: zBoolish.optional(),
  withDriver: zBoolish.optional(),
  fuel: z.enum(['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID']).optional(),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
  decoration: zBoolish.optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  estimatedKm: z.coerce.number().int().min(0).max(10000).optional(),
  q: z.string().max(80).optional(),
  featured: zBoolish.optional(),
  sort: z.enum(['recommended', 'price_asc', 'price_desc', 'rating', 'seats']).default('recommended'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

r.get('/vehicles', optionalAuth, async (req, res) => {
  const q = query(req, searchSchema);
  if (q.pickupAt && q.returnAt && q.returnAt <= q.pickupAt) throw badRequest('Return time must be after pickup time');

  const where: Prisma.VehicleWhereInput = { status: 'ACTIVE', owner: { kycStatus: 'APPROVED' } };
  const and: Prisma.VehicleWhereInput[] = [];
  if (q.city) and.push(isObjectId(q.city) ? { cityId: q.city } : { city: { slug: q.city } });
  if (q.category) and.push(isObjectId(q.category) ? { categoryId: q.category } : { category: { slug: q.category } });
  if (q.passengers) where.seats = { gte: q.passengers };
  if (q.luggage) where.luggageBags = { gte: q.luggage };
  if (q.ac === true) where.hasAc = true;
  if (q.ac === false) where.hasAc = false;
  if (q.withDriver === true) where.driverOption = { in: ['WITH_DRIVER', 'BOTH'] };
  if (q.withDriver === false) where.driverOption = { in: ['SELF_DRIVE', 'BOTH'] };
  if (q.fuel) where.fuelType = q.fuel;
  if (q.transmission) where.transmission = q.transmission;
  if (q.decoration || q.purpose === 'WEDDING') and.push({ OR: [{ decorationAvailable: true }, { category: { isWedding: true } }, ...(q.decoration ? [] : [{ seats: { gte: 7 } }])] });
  if (q.featured) where.isFeatured = true;
  if (q.minPrice != null || q.maxPrice != null) where.perDayRate = { gte: q.minPrice ?? 0, lte: q.maxPrice ?? 99_999_999 };
  if (q.q) and.push({ OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { model: { name: { contains: q.q, mode: 'insensitive' } } }, { model: { make: { contains: q.q, mode: 'insensitive' } } }] });

  let window: { startAt: Date; endAt: Date } | null = null;
  if (q.pickupAt && q.returnAt) {
    window = await blockWindow(q.pickupAt, q.returnAt);
    where.availability = { none: liveBlockWhere(window.startAt, window.endAt) };
    // Never offer vehicles whose compliance lapses during the trip.
    and.push({ OR: [...nullish('insuranceExpiry').OR, { insuranceExpiry: { gte: q.returnAt } }] });
    and.push({ OR: [...nullish('fitnessExpiry').OR, { fitnessExpiry: { gte: q.returnAt } }] });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.VehicleOrderByWithRelationInput[] =
    q.sort === 'price_asc' ? [{ perDayRate: 'asc' }] :
    q.sort === 'price_desc' ? [{ perDayRate: 'desc' }] :
    q.sort === 'rating' ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }] :
    q.sort === 'seats' ? [{ seats: 'desc' }] :
    [{ isFeatured: 'desc' }, { ratingAvg: 'desc' }, { perDayRate: 'asc' }];

  const [total, rows] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({ where, include: publicVehicleInclude, orderBy, ...paginate(q.page, q.pageSize) }),
  ]);

  // Price estimate per vehicle when dates are known.
  let km = q.estimatedKm ?? 0;
  let distanceSource: string | null = null;
  if (!km && q.pickupLocation && q.dropLocation) {
    const d = await roadDistance(q.pickupLocation, q.dropLocation);
    if (d) {
      km = q.purpose === 'AIRPORT_TRANSFER' ? d.km : d.km * 2; // round trip unless one-way transfer
      distanceSource = d.source;
    }
  }
  let estimates: Record<string, { total: number; advance: number; tripType: string }> = {};
  if (q.pickupAt && q.returnAt) {
    const [rules, settings] = await Promise.all([loadPricingRules(), pricingSettings()]);
    const hours = Math.ceil((q.returnAt.getTime() - q.pickupAt.getTime()) / 3_600_000);
    estimates = Object.fromEntries(
      rows.map((v) => {
        const withDriver = q.withDriver ?? v.driverOption !== 'SELF_DRIVE';
        const tripType = q.tripType ?? defaultTripType(q.purpose ?? 'LOCAL_TRAVEL', hours, withDriver);
        try {
          const quote = calculateQuote(vehicleRates(v), { tripType, pickupAt: q.pickupAt!, returnAt: q.returnAt!, estimatedKm: km, withDriver, decoration: !!q.decoration && v.decorationAvailable }, rules, settings);
          return [v.id, { total: quote.total, advance: quote.advance, tripType: quote.tripType }];
        } catch {
          return [v.id, { total: 0, advance: 0, tripType }];
        }
      }),
    );
  }

  res.json({
    ...pageResult(
      rows.map((v) => ({ ...serializePublicVehicle(v), available: window ? true : null, estimate: estimates[v.id] ?? null })),
      total,
      q.page,
      q.pageSize,
    ),
    estimatedKm: km,
    distanceSource,
  });
});

r.get('/vehicles/:slug', async (req, res) => {
  const v = await prisma.vehicle.findFirst({
    where: { ...(isObjectId(req.params.slug) ? { id: req.params.slug } : { slug: req.params.slug }), status: 'ACTIVE' },
    include: publicVehicleInclude,
  });
  if (!v) throw notFound('Vehicle');
  const [reviews, similar, settings] = await Promise.all([
    prisma.review.findMany({
      where: { vehicleId: v.id, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, rating: true, vehicleRating: true, driverRating: true, comment: true, ownerReply: true, createdAt: true, customer: { select: { name: true } } },
    }),
    prisma.vehicle.findMany({
      where: { status: 'ACTIVE', id: { not: v.id }, OR: [{ categoryId: v.categoryId }, { seats: { gte: v.seats - 1, lte: v.seats + 2 } }], cityId: v.cityId },
      include: publicVehicleInclude,
      take: 4,
      orderBy: { ratingAvg: 'desc' },
    }),
    getSettings(),
  ]);
  res.json({
    ...serializePublicVehicle(v),
    reviews,
    similar: similar.map(serializePublicVehicle),
    policies: {
      cancellationTiers: settings['cancellation.tiers'],
      advancePercent: settings['booking.advancePercent'],
      gstPercent: settings['tax.gstPercent'],
      fuel: v.driverOption === 'SELF_DRIVE' ? 'Self-drive vehicles are handed over with a full tank and must be returned full.' : 'Fuel is included in the per-km / package fare.',
      tollParking: 'Tolls, parking and interstate permit taxes are extra, at actuals, and appear on the final bill.',
      nightCharge: Number(v.nightChargePerNight) > 0 ? `Driver night charge of ₹${v.nightChargePerNight} applies for trips between ${settings['pricing.nightStartHour']}:00 and ${settings['pricing.nightEndHour']}:00 and per night halt.` : null,
      securityDeposit: Number(v.securityDeposit) > 0 ? `Refundable deposit of ₹${v.securityDeposit} for self-drive rentals, collected at pickup.` : null,
    },
  });
});

r.get('/vehicles/:id/calendar', async (req, res) => {
  const { from, to } = query(req, z.object({ from: z.coerce.date().default(() => new Date()), to: z.coerce.date().optional() }));
  const end = to ?? new Date(from.getTime() + 60 * 86_400_000);
  res.json(await vehicleCalendar(req.params.id, from, end));
});

const quoteSchema = z.object({
  vehicleId: z.string(),
  purpose: z.enum(PURPOSES).default('LOCAL_TRAVEL'),
  tripType: z.enum(TRIP_TYPES).optional(),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  pickupAddress: z.string().max(300).optional(),
  dropAddress: z.string().max(300).optional(),
  estimatedKm: z.coerce.number().int().min(0).max(20000).optional(),
  withDriver: z.boolean().default(true),
  decoration: z.boolean().default(false),
  destinationState: z.string().max(80).optional(),
  estimatedTolls: z.coerce.number().min(0).max(100000).optional(),
  couponCode: z.string().max(30).optional(),
});

/** Live price quote + availability for a single vehicle (used by details page & checkout). */
r.post('/quote', optionalAuth, async (req, res) => {
  const q = body(req, quoteSchema);
  if (q.returnAt <= q.pickupAt) throw badRequest('Return time must be after pickup time');
  const v = await prisma.vehicle.findFirst({ where: { id: q.vehicleId, status: 'ACTIVE' } });
  if (!v) throw notFound('Vehicle');
  let km = q.estimatedKm ?? 0;
  let distance = null;
  if (!q.estimatedKm && q.pickupAddress && q.dropAddress) {
    distance = await roadDistance(q.pickupAddress, q.dropAddress);
    if (distance) km = q.purpose === 'AIRPORT_TRANSFER' ? distance.km : distance.km * 2;
  }
  const hours = Math.ceil((q.returnAt.getTime() - q.pickupAt.getTime()) / 3_600_000);
  const tripType = q.tripType ?? defaultTripType(q.purpose, hours, q.withDriver);
  const window = await blockWindow(q.pickupAt, q.returnAt);
  const conflicts = await prisma.vehicleAvailability.count({ where: { vehicleId: v.id, ...liveBlockWhere(window.startAt, window.endAt) } });
  const { quote, coupon } = await quoteForVehicle(
    v,
    { tripType, pickupAt: q.pickupAt, returnAt: q.returnAt, estimatedKm: km, withDriver: q.withDriver, decoration: q.decoration, destinationState: q.destinationState, estimatedTolls: q.estimatedTolls, purpose: q.purpose, couponCode: q.couponCode },
    req.user?.id,
  );
  res.json({ available: conflicts === 0, quote, coupon: coupon ? { code: coupon.code, title: coupon.title } : null, estimatedKm: km, distance });
});

// ───────────────────── Packages ─────────────────────

r.get('/wedding-packages', async (_req, res) => {
  const p = await prisma.weddingPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json(p.map((x) => ({ ...x, imageUrl: x.imageUrl ? publicUrl(x.imageUrl) : null })));
});

r.get('/travel-packages', async (req, res) => {
  const q = query(req, z.object({ type: z.string().optional(), featured: zBoolish.optional(), q: z.string().max(80).optional() }));
  const p = await prisma.travelPackage.findMany({
    where: {
      isPublished: true,
      ...(q.type ? { type: q.type as Prisma.EnumTravelPackageTypeFilter['equals'] } : {}),
      ...(q.featured ? { isFeatured: true } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { destination: { contains: q.q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ isFeatured: 'desc' }, { basePrice: 'asc' }],
    include: { recommendedCategory: { select: { name: true, slug: true } } },
  });
  res.json(p.map((x) => ({ ...x, imageUrl: x.imageUrl ? publicUrl(x.imageUrl) : null })));
});

r.get('/travel-packages/:slug', async (req, res) => {
  const p = await prisma.travelPackage.findUnique({
    where: { slug: req.params.slug },
    include: { itinerary: { orderBy: { dayNumber: 'asc' } }, recommendedCategory: true },
  });
  if (!p || !p.isPublished) throw notFound('Package');
  res.json({ ...p, imageUrl: p.imageUrl ? publicUrl(p.imageUrl) : null, gallery: p.gallery.map(publicUrl) });
});

// ───────────────────── Enquiries ─────────────────────

r.post('/enquiries', optionalAuth, async (req, res) => {
  const e = body(
    req,
    z.object({
      type: z.enum(['CONTACT', 'CUSTOM_TRAVEL', 'CORPORATE']).default('CONTACT'),
      name: zText(120).pipe(z.string().min(2)),
      phone: zPhone,
      email: z.string().email().optional().or(z.literal('')),
      message: zText(3000).pipe(z.string().min(5)),
      meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  );
  const row = await prisma.enquiry.create({ data: { ...e, email: e.email || null, userId: req.user?.id ?? null, meta: e.meta } });
  void notifyAdmins(`New ${e.type.toLowerCase().replace('_', ' ')} enquiry`, `${e.name} (${e.phone}): ${e.message.slice(0, 200)}`);
  res.status(201).json({ id: row.id, ok: true });
});

export default r;
