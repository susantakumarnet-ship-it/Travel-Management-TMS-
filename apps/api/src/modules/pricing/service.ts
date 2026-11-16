import type { Coupon, TravelPurpose, Vehicle } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';
import { badRequest } from '../../lib/errors.js';
import { num, round2 } from '../../lib/util.js';
import { env } from '../../config/env.js';
import { calculateQuote, type PricingRuleInput, type Quote, type QuoteInput, type VehicleRates } from './engine.js';

export function vehicleRates(v: Vehicle): VehicleRates {
  return {
    categoryId: v.categoryId,
    perKmRate: num(v.perKmRate),
    perDayRate: num(v.perDayRate),
    perHourRate: num(v.perHourRate),
    minBookingHours: v.minBookingHours,
    includedKmPerDay: v.includedKmPerDay,
    includedKmPerHour: v.includedKmPerHour,
    extraKmRate: num(v.extraKmRate),
    extraHourRate: num(v.extraHourRate),
    driverAllowancePerDay: num(v.driverAllowancePerDay),
    nightChargePerNight: num(v.nightChargePerNight),
    decorationCharge: num(v.decorationCharge),
    securityDeposit: num(v.securityDeposit),
    selfDrivePerDayRate: v.selfDrivePerDayRate == null ? null : num(v.selfDrivePerDayRate),
    decorationAvailable: v.decorationAvailable,
  };
}

export async function loadPricingRules(db: Tx | typeof prisma = prisma): Promise<PricingRuleInput[]> {
  const rows = await db.pricingRule.findMany({ where: { isActive: true }, orderBy: { priority: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    categoryId: r.categoryId,
    startDate: r.startDate,
    endDate: r.endDate,
    daysOfWeek: r.daysOfWeek,
    multiplier: r.multiplier == null ? null : num(r.multiplier),
    flatAmount: r.flatAmount == null ? null : num(r.flatAmount),
    state: r.state,
    config: (r.config as Record<string, unknown> | null) ?? null,
    priority: r.priority,
  }));
}

export async function pricingSettings() {
  const s = await getSettings();
  return {
    gstPercent: s['tax.gstPercent'],
    advancePercent: s['booking.advancePercent'],
    nightStartHour: s['pricing.nightStartHour'],
    nightEndHour: s['pricing.nightEndHour'],
    outstationMinKmPerDay: s['pricing.outstationMinKmPerDay'],
    homeState: env.COMPANY_STATE,
  };
}

/** Validate a coupon for a user/booking and compute the discount on a pre-tax subtotal. */
export async function evaluateCoupon(
  code: string,
  ctx: { userId: string; purpose: TravelPurpose; categoryId: string; subtotal: number },
  db: Tx | typeof prisma = prisma,
): Promise<{ coupon: Coupon; discount: number }> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.isActive) throw badRequest('This coupon code is not valid');
  if (now < coupon.validFrom || now > coupon.validTo) throw badRequest('This coupon has expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw badRequest('This coupon has been fully redeemed');
  if (coupon.purposes.length && !coupon.purposes.includes(ctx.purpose)) throw badRequest('This coupon is not valid for this trip type');
  if (coupon.categoryIds.length && !coupon.categoryIds.includes(ctx.categoryId)) throw badRequest('This coupon is not valid for this vehicle category');
  if (ctx.subtotal < num(coupon.minOrderAmount)) throw badRequest(`Minimum booking value for this coupon is ₹${num(coupon.minOrderAmount)}`);
  const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: ctx.userId } });
  if (used >= coupon.perUserLimit) throw badRequest('You have already used this coupon');
  let discount = coupon.discountType === 'PERCENT' ? (ctx.subtotal * num(coupon.value)) / 100 : num(coupon.value);
  if (coupon.maxDiscount != null) discount = Math.min(discount, num(coupon.maxDiscount));
  return { coupon, discount: round2(Math.min(discount, ctx.subtotal)) };
}

export interface QuoteRequest extends Omit<QuoteInput, 'discount' | 'discountLabel'> {
  couponCode?: string;
  purpose: TravelPurpose;
}

/** Two-pass quote: compute subtotal, then apply coupon discount and re-run for tax/advance. */
export async function quoteForVehicle(vehicle: Vehicle, req: QuoteRequest, userId?: string, db: Tx | typeof prisma = prisma) {
  const [rules, settings] = await Promise.all([loadPricingRules(db), pricingSettings()]);
  const rates = vehicleRates(vehicle);
  let quote: Quote = calculateQuote(rates, req, rules, settings);
  let coupon: Coupon | null = null;
  if (req.couponCode) {
    if (!userId) throw badRequest('Please sign in to apply a coupon');
    const r = await evaluateCoupon(req.couponCode, { userId, purpose: req.purpose, categoryId: vehicle.categoryId, subtotal: quote.subtotal }, db);
    coupon = r.coupon;
    quote = calculateQuote(rates, { ...req, discount: r.discount, discountLabel: `Coupon ${r.coupon.code}` }, rules, settings);
  }
  return { quote, coupon };
}
