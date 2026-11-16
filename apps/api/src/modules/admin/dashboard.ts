import { Router } from 'express';
import { z } from 'zod';
import { prisma, nullish } from '../../lib/prisma.js';
import { query } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { num, round2, startOfIstDay, addDays, istMonthStart } from '../../lib/util.js';
import { bookingValue, CANCELLED_STATUSES, CONFIRMED_STATUSES, groupFold, periodKey, sortedEntries } from '../../lib/analytics.js';

const r = Router();

r.get('/', requirePermission('dashboard:read'), async (req, res) => {
  const { months } = query(req, z.object({ months: z.coerce.number().int().min(3).max(24).default(12) }));
  const now = new Date();
  const today = startOfIstDay(now);
  const tomorrow = addDays(today, 1);
  const paidStatuses = ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'] as const;

  const [
    revenueAgg,
    totalBookings,
    todaysBookings,
    upcomingWeddings,
    totalVehicles,
    maintenance,
    activeVehicleIds,
    busyNow,
    customers,
    activeDrivers,
    pendingPayments,
    pendingRequests,
    cancelled,
    pendingApprovals,
  ] = await Promise.all([
    prisma.payment.aggregate({ where: { status: 'CAPTURED' }, _sum: { amount: true } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
    prisma.weddingRequest.count({ where: { weddingDate: { gte: today }, status: { in: ['QUOTED', 'ACCEPTED', 'CONFIRMED', 'ENQUIRY'] } } }),
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: 'MAINTENANCE' } }),
    prisma.vehicle.count({ where: { status: 'ACTIVE' } }),
    prisma.vehicleAvailability.findMany({ where: { active: true, startAt: { lte: now }, endAt: { gt: now }, OR: [...nullish('holdExpiresAt').OR, { holdExpiresAt: { gt: now } }] }, select: { vehicleId: true }, distinct: ['vehicleId'] }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.driver.count({ where: { verificationStatus: 'APPROVED', isAvailable: true, user: { status: 'ACTIVE' } } }),
    prisma.booking.aggregate({
      where: { status: { in: [...paidStatuses] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.booking.count({ where: { OR: [{ status: 'AWAITING_PAYMENT' }, { ownerDecision: 'PENDING', status: { notIn: ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'] } }] } }),
    prisma.booking.count({ where: { status: { in: ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'] } } }),
    Promise.all([
      prisma.vehicle.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.vehicleOwner.count({ where: { kycStatus: 'PENDING' } }),
      prisma.driver.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.weddingRequest.count({ where: { status: 'ENQUIRY' } }),
      prisma.refund.count({ where: { status: { in: ['INITIATED', 'FAILED'] } } }),
      prisma.enquiry.count({ where: { status: 'NEW' } }),
    ]),
  ]);
  const refunded = await prisma.refund.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true } });

  const since = istMonthStart(new Date(now.getTime() - (months - 1) * 31 * 86_400_000));
  const [payments, recent30, confirmedBookings, sinceBookings, vehicles, owners, categories] = await Promise.all([
    prisma.payment.findMany({ where: { status: 'CAPTURED', capturedAt: { gte: since } }, select: { amount: true, bookingId: true, capturedAt: true, gateway: true, method: true } }),
    prisma.booking.findMany({ where: { createdAt: { gte: addDays(today, -29) } }, select: { createdAt: true, totalAmount: true } }),
    prisma.booking.findMany({ where: { status: { in: [...CONFIRMED_STATUSES] } }, select: { vehicleId: true, ownerId: true, finalAmount: true, totalAmount: true, ownerPayout: true, commissionAmount: true } }),
    prisma.booking.findMany({ where: { createdAt: { gte: since }, status: { notIn: [...CANCELLED_STATUSES] } }, select: { createdAt: true, purpose: true } }),
    prisma.vehicle.findMany({ select: { id: true, title: true, categoryId: true } }),
    prisma.vehicleOwner.findMany({ select: { id: true, businessName: true } }),
    prisma.vehicleCategory.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const ownerName = new Map(owners.map((o) => [o.id, o.businessName]));

  const monthlyRevenue = sortedEntries(
    groupFold(payments, (p) => periodKey(p.capturedAt!, 'month'), () => ({ revenue: 0, ids: new Set<string>() }), (a, p) => {
      a.revenue += p.amount;
      a.ids.add(p.bookingId);
    }),
  ).map(([month, a]) => ({ month, revenue: round2(a.revenue), bookings: a.ids.size }));

  const dailyTrend = sortedEntries(
    groupFold(recent30, (b) => periodKey(b.createdAt, 'day'), () => ({ bookings: 0, value: 0 }), (a, b) => {
      a.bookings++;
      a.value += b.totalAmount;
    }),
  ).map(([day, a]) => ({ day, bookings: a.bookings, value: round2(a.value) }));

  const byCategory = groupFold(confirmedBookings, (b) => vehicleById.get(b.vehicleId)?.categoryId ?? '-', () => ({ bookings: 0, revenue: 0 }), (a, b) => {
    a.bookings++;
    a.revenue += bookingValue(b);
  });
  const categoryPerformance = categories
    .map((c) => ({ category: c.name, bookings: byCategory.get(c.id)?.bookings ?? 0, revenue: round2(byCategory.get(c.id)?.revenue ?? 0) }))
    .sort((a, b) => b.revenue - a.revenue);

  const weddingVsRegular = sortedEntries(
    groupFold(sinceBookings, (b) => periodKey(b.createdAt, 'month'), () => ({ wedding: 0, regular: 0 }), (a, b) => {
      if (b.purpose === 'WEDDING') a.wedding++;
      else a.regular++;
    }),
  ).map(([month, a]) => ({ month, ...a }));

  const topVehicles = [...groupFold(confirmedBookings, (b) => vehicleById.get(b.vehicleId)?.title ?? 'Unknown', () => ({ bookings: 0, revenue: 0 }), (a, b) => {
    a.bookings++;
    a.revenue += bookingValue(b);
  }).entries()]
    .map(([vehicle, a]) => ({ vehicle, bookings: a.bookings, revenue: round2(a.revenue) }))
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue)
    .slice(0, 8);

  const ownerRevenue = [...groupFold(confirmedBookings, (b) => b.ownerId, () => ({ revenue: 0, payout: 0, commission: 0 }), (a, b) => {
    a.revenue += bookingValue(b);
    a.payout += b.ownerPayout;
    a.commission += b.commissionAmount;
  }).entries()]
    .map(([id, a]) => ({ owner: ownerName.get(id) ?? 'Unknown', revenue: round2(a.revenue), payout: round2(a.payout), commission: round2(a.commission) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const paymentCollection = [...groupFold(payments, (p) => `${p.gateway}|${p.method ?? 'other'}`, () => ({ amount: 0, count: 0 }), (a, p) => {
    a.amount += p.amount;
    a.count++;
  }).entries()]
    .map(([k, a]) => ({ gateway: k.split('|')[0], method: k.split('|')[1], amount: round2(a.amount), count: a.count }))
    .sort((a, b) => b.amount - a.amount);

  const recentBookings = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, bookingNumber: true, status: true, purpose: true, totalAmount: true, pickupAt: true, createdAt: true, customer: { select: { name: true, phone: true } }, vehicle: { select: { title: true } } },
  });

  const [pv, po, pd, pw, pr, pe] = pendingApprovals;
  res.json({
    cards: {
      totalRevenue: round2(num(revenueAgg._sum.amount) - num(refunded._sum.amount)),
      grossCollected: round2(num(revenueAgg._sum.amount)),
      refunded: round2(num(refunded._sum.amount)),
      totalBookings,
      todaysBookings,
      upcomingWeddings,
      totalVehicles,
      availableVehicles: Math.max(0, activeVehicleIds - busyNow.length),
      maintenance,
      customers,
      activeDrivers,
      pendingPayments: round2(num(pendingPayments._sum.totalAmount) - num(pendingPayments._sum.paidAmount)),
      pendingRequests,
      cancelled,
    },
    actionItems: { vehicleApprovals: pv, ownerKyc: po, driverVerification: pd, weddingEnquiries: pw, refunds: pr, enquiries: pe },
    charts: { monthlyRevenue, dailyTrend, categoryPerformance, weddingVsRegular, topVehicles, ownerRevenue, paymentCollection },
    recentBookings,
  });
});

export default r;
