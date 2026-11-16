import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, nullish, setAnd } from '../../lib/prisma.js';
import { body, query, zPage, zText } from '../../lib/validate.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { num, pageResult, paginate, round2 } from '../../lib/util.js';
import { initiateRefund, settleRefund } from '../payments/service.js';
import { renderInvoicePdf } from '../invoices/service.js';
import { notify } from '../notifications/service.js';

const r = Router();

// ───────────────────── Payments ─────────────────────

r.get('/payments', requirePermission('payments:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional(), gateway: z.string().optional(), q: z.string().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }));
  const where: Prisma.PaymentWhereInput = {
    ...(q.status ? { status: q.status as Prisma.EnumPaymentStatusFilter['equals'] } : {}),
    ...(q.gateway ? { gateway: q.gateway as Prisma.EnumPaymentGatewayFilter['equals'] } : {}),
    ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
    ...(q.q ? { OR: [{ gatewayPaymentId: { contains: q.q } }, { gatewayOrderId: { contains: q.q } }, { booking: { bookingNumber: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  };
  const [total, items, sums] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { booking: { select: { id: true, bookingNumber: true } }, user: { select: { name: true, phone: true } }, refunds: { select: { amount: true, status: true } } } }),
    prisma.payment.aggregate({ where: { ...where, status: 'CAPTURED' }, _sum: { amount: true } }),
  ]);
  res.json({ ...pageResult(items, total, q.page, q.pageSize), capturedTotal: num(sums._sum.amount) });
});

// ───────────────────── Refunds ─────────────────────

r.get('/refunds', requirePermission('refunds:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional() }));
  const where: Prisma.RefundWhereInput = q.status ? { status: q.status as Prisma.EnumRefundStatusFilter['equals'] } : {};
  const [total, items] = await Promise.all([
    prisma.refund.count({ where }),
    prisma.refund.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { booking: { select: { id: true, bookingNumber: true, customer: { select: { name: true, phone: true } } } }, payment: { select: { gateway: true, gatewayPaymentId: true, method: true } } } }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

r.post('/refunds', requirePermission('refunds:write'), async (req, res) => {
  const d = body(req, z.object({ bookingId: z.string(), amount: z.coerce.number().positive(), reason: zText(300).pipe(z.string().min(3)) }));
  const out = await initiateRefund(d.bookingId, d.amount, d.reason, req.user!.id);
  if (!out.length) throw badRequest('No refundable payments on this booking');
  await audit(req, 'refund.initiate', 'Booking', d.bookingId, { after: d });
  res.status(201).json(out);
});

/** Manually mark offline (cash / bank) or stuck refunds as processed / failed. */
r.post('/refunds/:id/settle', requirePermission('refunds:write'), async (req, res) => {
  const { success, reference } = body(req, z.object({ success: z.boolean(), reference: zText(80).optional() }));
  if (reference) await prisma.refund.update({ where: { id: req.params.id }, data: { gatewayRefundId: reference } });
  await settleRefund(req.params.id, success, req.user!.id);
  await audit(req, 'refund.settle', 'Refund', req.params.id, { after: { success, reference } });
  res.json({ ok: true });
});

r.post('/refunds/:id/retry', requirePermission('refunds:write'), async (req, res) => {
  const rf = await prisma.refund.findUniqueOrThrow({ where: { id: req.params.id } });
  if (rf.status !== 'FAILED') throw conflict('Only failed refunds can be retried');
  await prisma.refund.update({ where: { id: rf.id }, data: { status: 'FAILED', failureReason: `${rf.failureReason ?? ''} (retried)`.slice(0, 300) } });
  // A failed refund no longer counts against refundable balance, so initiate a fresh one.
  const out = await initiateRefund(rf.bookingId, num(rf.amount), rf.reason ?? 'Retry', req.user!.id);
  await audit(req, 'refund.retry', 'Refund', rf.id);
  res.json(out);
});

// ───────────────────── Invoices ─────────────────────

r.get('/invoices', requirePermission('payments:read'), async (req, res) => {
  const q = query(req, zPage.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }));
  const where: Prisma.InvoiceWhereInput = q.from || q.to ? { issuedAt: { gte: q.from, lte: q.to } } : {};
  const [total, items] = await Promise.all([prisma.invoice.count({ where }), prisma.invoice.findMany({ where, orderBy: { issuedAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { booking: { select: { bookingNumber: true } } } })]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});
r.get('/invoices/:id/pdf', requirePermission('payments:read'), async (req, res) => {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${inv.invoiceNumber.replace(/\//g, '-')}.pdf"`);
  res.send(await renderInvoicePdf(inv.id));
});

// ───────────────────── Commission & settlements ─────────────────────

r.get('/commissions', requirePermission('commissions:read'), async (_req, res) => {
  const [byOwner, categories, owners] = await Promise.all([
    prisma.booking.groupBy({ by: ['ownerId'], where: { status: 'TRIP_COMPLETED' }, _sum: { commissionAmount: true, ownerPayout: true, finalAmount: true }, _count: true }),
    prisma.vehicleCategory.findMany({ select: { id: true, name: true, commissionRate: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.vehicleOwner.findMany({ select: { id: true, businessName: true, commissionRate: true } }),
  ]);
  const unsettled = await prisma.booking.groupBy({ by: ['ownerId'], where: { status: 'TRIP_COMPLETED', AND: [nullish('settlementId')] }, _sum: { ownerPayout: true }, _count: true });
  res.json({
    categories,
    owners: owners.map((o) => {
      const a = byOwner.find((x) => x.ownerId === o.id);
      const u = unsettled.find((x) => x.ownerId === o.id);
      return { ...o, trips: a?._count ?? 0, revenue: num(a?._sum.finalAmount), commission: num(a?._sum.commissionAmount), payout: num(a?._sum.ownerPayout), unsettled: num(u?._sum.ownerPayout), unsettledTrips: u?._count ?? 0 };
    }),
  });
});

r.get('/settlements', requirePermission('commissions:read'), async (req, res) => {
  const q = query(req, zPage.extend({ status: z.string().optional(), ownerId: z.string().optional() }));
  const where: Prisma.OwnerSettlementWhereInput = { ...(q.status ? { status: q.status as Prisma.EnumSettlementStatusFilter['equals'] } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}) };
  const [total, items] = await Promise.all([
    prisma.ownerSettlement.count({ where }),
    prisma.ownerSettlement.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize), include: { owner: { select: { businessName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true, upiId: true } }, _count: { select: { bookings: true } } } }),
  ]);
  res.json(pageResult(items, total, q.page, q.pageSize));
});

/** Bundle all completed, unsettled bookings for an owner up to periodEnd into one settlement. */
r.post('/settlements', requirePermission('commissions:write'), async (req, res) => {
  const d = body(req, z.object({ ownerId: z.string(), periodEnd: z.coerce.date().default(() => new Date()), adjustments: z.coerce.number().default(0), note: zText(300).optional() }));
  const s = await prisma.$transaction(async (tx) => {
    const bookings = await tx.booking.findMany({ where: { ownerId: d.ownerId, status: 'TRIP_COMPLETED', AND: [nullish('settlementId'), setAnd('completedAt', { lte: d.periodEnd })] }, select: { id: true, completedAt: true, finalAmount: true, commissionAmount: true, ownerPayout: true } });
    if (!bookings.length) throw badRequest('No unsettled completed trips for this owner');
    const gross = round2(bookings.reduce((a, b) => a + num(b.finalAmount), 0));
    const commission = round2(bookings.reduce((a, b) => a + num(b.commissionAmount), 0));
    const payout = round2(bookings.reduce((a, b) => a + num(b.ownerPayout), 0));
    const start = bookings.reduce((m, b) => (b.completedAt! < m ? b.completedAt! : m), bookings[0].completedAt!);
    const settlement = await tx.ownerSettlement.create({
      data: { ownerId: d.ownerId, periodStart: start, periodEnd: d.periodEnd, grossAmount: gross, commissionAmount: commission, adjustments: d.adjustments, netAmount: round2(payout + d.adjustments), note: d.note },
    });
    await tx.booking.updateMany({ where: { id: { in: bookings.map((b) => b.id) } }, data: { settlementId: settlement.id } });
    return settlement;
  });
  await audit(req, 'settlement.create', 'OwnerSettlement', s.id, { after: s });
  res.status(201).json(s);
});

r.patch('/settlements/:id', requirePermission('commissions:write'), async (req, res) => {
  const d = body(req, z.object({ status: z.enum(['PENDING', 'PROCESSING', 'PAID']), referenceNumber: zText(60).optional(), note: zText(300).optional() }));
  if (d.status === 'PAID' && !d.referenceNumber) throw badRequest('Enter the bank/UPI transaction reference');
  const s = await prisma.ownerSettlement.update({ where: { id: req.params.id }, data: { ...d, paidAt: d.status === 'PAID' ? new Date() : null }, include: { owner: { include: { user: true } } } });
  await audit(req, 'settlement.update', 'OwnerSettlement', s.id, { after: d });
  if (d.status === 'PAID') {
    void notify({ userId: s.owner.userId, phone: s.owner.user.phone, email: s.owner.user.email }, 'ADMIN_ALERT', { title: 'Settlement paid', message: `Settlement of Rs. ${num(s.netAmount).toFixed(2)} has been paid. Ref: ${d.referenceNumber}` });
  }
  res.json(s);
});

/** Remove an unpaid settlement and release its bookings. */
r.delete('/settlements/:id', requirePermission('commissions:write'), async (req, res) => {
  const s = await prisma.ownerSettlement.findUniqueOrThrow({ where: { id: req.params.id } });
  if (s.status === 'PAID') throw conflict('Paid settlements cannot be deleted');
  await prisma.$transaction([prisma.booking.updateMany({ where: { settlementId: s.id }, data: { settlementId: null } }), prisma.ownerSettlement.delete({ where: { id: s.id } })]);
  await audit(req, 'settlement.delete', 'OwnerSettlement', s.id);
  res.json({ ok: true });
});

// ───────────────────── Coupons ─────────────────────

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3–30 letters, digits, - or _'),
  title: zText(120).pipe(z.string().min(2)),
  description: zText(500).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  value: z.coerce.number().positive(),
  maxDiscount: z.coerce.number().positive().optional().nullable(),
  minOrderAmount: z.coerce.number().min(0).default(0),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  perUserLimit: z.coerce.number().int().positive().default(1),
  purposes: z.array(z.enum(['WEDDING', 'FAMILY_TRIP', 'BUSINESS', 'AIRPORT_TRANSFER', 'LOCAL_TRAVEL', 'OUTSTATION', 'OTHER'])).default([]),
  categoryIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});
const checkCoupon = (d: Partial<z.infer<typeof couponSchema>>) => {
  if (d.discountType === 'PERCENT' && d.value != null && d.value > 100) throw badRequest('Percentage cannot exceed 100');
  if (d.validFrom && d.validTo && d.validTo <= d.validFrom) throw badRequest('End date must be after start date');
};
r.get('/coupons', requirePermission('coupons:read'), async (_req, res) => {
  res.json(await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { redemptions: true } } } }));
});
r.post('/coupons', requirePermission('coupons:write'), async (req, res) => {
  const d = body(req, couponSchema);
  checkCoupon(d);
  const c = await prisma.coupon.create({ data: d });
  await audit(req, 'coupon.create', 'Coupon', c.id, { after: c });
  res.status(201).json(c);
});
r.put('/coupons/:id', requirePermission('coupons:write'), async (req, res) => {
  const d = body(req, couponSchema.partial());
  checkCoupon(d);
  const c = await prisma.coupon.update({ where: { id: req.params.id }, data: d });
  await audit(req, 'coupon.update', 'Coupon', c.id, { after: d });
  res.json(c);
});
r.delete('/coupons/:id', requirePermission('coupons:write'), async (req, res) => {
  const used = await prisma.couponRedemption.count({ where: { couponId: req.params.id } });
  if (used) {
    await prisma.coupon.update({ where: { id: req.params.id }, data: { isActive: false } });
    return res.json({ ok: true, deactivated: true });
  }
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ───────────────────── Pricing rules ─────────────────────

const ruleSchema = z.object({
  name: zText(120).pipe(z.string().min(2)),
  type: z.enum(['SEASONAL', 'WEEKEND', 'NIGHT', 'STATE_TAX', 'WAITING', 'PEAK_DATE']),
  categoryId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  multiplier: z.coerce.number().min(0.1).max(5).optional().nullable(),
  flatAmount: z.coerce.number().min(0).optional().nullable(),
  state: zText(80).optional().nullable(),
  config: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional().nullable(),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
const checkRule = (d: Partial<z.infer<typeof ruleSchema>>) => {
  if ((d.type === 'SEASONAL' || d.type === 'WEEKEND' || d.type === 'PEAK_DATE') && d.multiplier == null) throw badRequest('Multiplier is required for this rule type');
  if (d.type === 'WEEKEND' && !d.daysOfWeek?.length) throw badRequest('Select at least one day');
  if ((d.type === 'SEASONAL' || d.type === 'PEAK_DATE') && (!d.startDate || !d.endDate)) throw badRequest('Start and end dates are required');
  if (d.type === 'STATE_TAX' && (!d.state || d.flatAmount == null)) throw badRequest('State and amount are required');
};
r.get('/pricing-rules', requirePermission('settings:read'), async (_req, res) => {
  res.json(await prisma.pricingRule.findMany({ orderBy: [{ type: 'asc' }, { priority: 'desc' }], include: { category: { select: { name: true } } } }));
});
r.post('/pricing-rules', requirePermission('settings:write'), async (req, res) => {
  const d = body(req, ruleSchema);
  checkRule(d);
  const rule = await prisma.pricingRule.create({ data: { ...d, config: d.config ?? undefined } });
  await audit(req, 'pricing_rule.create', 'PricingRule', rule.id, { after: rule });
  res.status(201).json(rule);
});
r.put('/pricing-rules/:id', requirePermission('settings:write'), async (req, res) => {
  const d = body(req, ruleSchema);
  checkRule(d);
  const before = await prisma.pricingRule.findUniqueOrThrow({ where: { id: req.params.id } });
  const rule = await prisma.pricingRule.update({ where: { id: req.params.id }, data: { ...d, config: d.config ?? undefined } });
  await audit(req, 'pricing_rule.update', 'PricingRule', rule.id, { before, after: rule });
  res.json(rule);
});
r.delete('/pricing-rules/:id', requirePermission('settings:write'), async (req, res) => {
  await prisma.pricingRule.delete({ where: { id: req.params.id } });
  await audit(req, 'pricing_rule.delete', 'PricingRule', req.params.id);
  res.json({ ok: true });
});

export default r;
