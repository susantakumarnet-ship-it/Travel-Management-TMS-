import type { Payment, PaymentGateway, PaymentPurpose, Prisma } from '@prisma/client';
import { prisma, withTx, isObjectId } from '../../lib/prisma.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { formatINR, num, round2 } from '../../lib/util.js';
import { getGateway, testGatewaySignature, type GatewayEvent } from '../../integrations/payments.js';
import { afterConfirmedNotifications, confirmAfterPayment, transition } from '../bookings/service.js';
import { notify, notifyAdmins } from '../notifications/service.js';
import type { AuthUser } from '../../middleware/auth.js';

/** Amount the customer should pay now for a given purpose. */
export function amountDue(
  b: { status: string; advanceAmount: unknown; totalAmount: unknown; finalAmount: unknown; paidAmount: unknown },
  purpose: PaymentPurpose,
): number {
  const total = num(b.finalAmount ?? b.totalAmount);
  const paid = num(b.paidAmount);
  if (purpose === 'ADVANCE') return round2(Math.max(0, num(b.advanceAmount) - paid));
  return round2(Math.max(0, total - paid));
}

export async function createPaymentOrder(bookingId: string, user: AuthUser, purpose: PaymentPurpose) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!b) throw notFound('Booking');
  if (b.customerId !== user.id) throw forbidden();
  if (purpose === 'BALANCE' && !['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'].includes(b.status)) {
    throw conflict('Balance can be paid only for confirmed bookings');
  }
  if (purpose !== 'BALANCE' && b.status !== 'AWAITING_PAYMENT') throw conflict('This booking is not awaiting payment');
  if (purpose !== 'BALANCE') {
    const hold = await prisma.vehicleAvailability.findFirst({ where: { bookingId, active: true } });
    if (hold?.holdExpiresAt && hold.holdExpiresAt < new Date()) throw conflict('Your reservation has expired. Please book again.');
  }
  const amount = amountDue(b, purpose);
  if (amount <= 0) throw badRequest('Nothing is due on this booking');

  const gw = getGateway();
  const order = await gw.createOrder({
    amount,
    receipt: `${b.bookingNumber}-${purpose[0]}`,
    customer: { id: b.customerId, phone: b.customer.phone, name: b.customer.name, email: b.customer.email },
    notes: { bookingId: b.id, bookingNumber: b.bookingNumber, purpose },
  });
  const payment = await prisma.payment.create({
    data: { bookingId: b.id, userId: user.id, gateway: order.gateway, purpose, amount, gatewayOrderId: order.orderId, status: 'CREATED' },
  });
  const checkout = order.gateway === 'TEST' ? { ...order.checkout, signature: testGatewaySignature(order.orderId) } : order.checkout;
  return { paymentId: payment.id, amount, gateway: order.gateway, checkout };
}

/**
 * Idempotent capture. Safe to call from both the browser callback and the webhook;
 * whichever arrives first wins, the other is a no-op.
 */
export async function capturePayment(args: { gateway: PaymentGateway; orderId: string; gatewayPaymentId: string; amount: number; method?: string; raw?: unknown }) {
  const res = await withTx(async (tx) => {
    // Concurrent captures of the same order (webhook + browser) write-conflict on this document;
    // withTx retries the loser, which then sees CAPTURED and exits as a no-op.
    const p = await tx.payment.findFirst({ where: { gatewayOrderId: args.orderId } });
    if (!p) throw notFound('Payment order');
    if (p.gateway !== args.gateway) throw badRequest('Gateway mismatch');
    if (p.status === 'CAPTURED') return { payment: p, alreadyCaptured: true, confirmed: false, needsRefund: false, mismatch: false };
    if (Math.abs(args.amount - num(p.amount)) > 0.01) {
      // Persist the failure (do not throw inside the transaction or this write is rolled back).
      await tx.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: `Amount mismatch: expected ${num(p.amount)}, got ${args.amount}`, rawPayload: args.raw as Prisma.InputJsonValue } });
      return { payment: p, alreadyCaptured: false, confirmed: false, needsRefund: false, mismatch: true };
    }
    const updated = await tx.payment.update({
      where: { id: p.id },
      data: { status: 'CAPTURED', gatewayPaymentId: args.gatewayPaymentId, method: args.method?.slice(0, 30), capturedAt: new Date(), rawPayload: (args.raw ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await tx.booking.update({ where: { id: p.bookingId }, data: { paidAmount: { increment: p.amount } } });
    let confirmed = false;
    let needsRefund = false;
    if (p.purpose !== 'BALANCE') {
      const r = await confirmAfterPayment(tx, p.bookingId);
      confirmed = r.confirmed;
      needsRefund = r.needsRefund;
    }
    return { payment: updated, alreadyCaptured: false, confirmed, needsRefund, mismatch: false };
  });

  if (res.mismatch) {
    void notifyAdmins('Payment amount mismatch', `Order ${args.orderId} reported ${formatINR(args.amount)}; expected ${formatINR(num(res.payment.amount))}.`);
    throw new AppError(400, 'Payment amount mismatch', 'AMOUNT_MISMATCH');
  }
  if (res.alreadyCaptured) return res.payment;
  const { createInvoice } = await import('../invoices/service.js');
  if (res.confirmed) {
    await createInvoice(res.payment.bookingId, 'ADVANCE_RECEIPT').catch((e) => logger.error({ err: e }, 'receipt failed'));
    void afterConfirmedNotifications(res.payment.bookingId);
  }
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: res.payment.bookingId }, include: { customer: true } });
  void notify({ userId: b.customerId, email: b.customer.email, phone: b.customer.phone }, 'PAYMENT_RECEIVED', {
    amount: formatINR(num(res.payment.amount)),
    bookingNumber: b.bookingNumber,
    paymentRef: res.payment.gatewayPaymentId,
  }, ['WHATSAPP', 'EMAIL', 'IN_APP']);
  if (res.needsRefund) {
    logger.warn({ bookingId: b.id }, 'Payment received for an expired/unavailable booking: refunding');
    await initiateRefund(b.id, num(res.payment.amount), 'Slot no longer available when payment was received', null);
    void notifyAdmins('Late payment auto-refunded', `Payment for ${b.bookingNumber} arrived after the slot was taken; a full refund was initiated.`);
  }
  return res.payment;
}

export async function verifyCheckout(paymentId: string, user: AuthUser, body: Record<string, string>) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== user.id) throw notFound('Payment');
  if (p.status === 'CAPTURED') return p;
  const gw = getGateway(p.gateway);
  const v = await gw.verifyCheckout({ ...body, order_id: body.order_id ?? p.gatewayOrderId ?? '', test_order_id: body.test_order_id ?? '', amount: String(num(p.amount)) });
  if (!v || v.orderId !== p.gatewayOrderId) throw badRequest('Payment could not be verified. If money was debited it will be confirmed automatically within a few minutes.');
  return capturePayment({ gateway: p.gateway, orderId: v.orderId, gatewayPaymentId: v.paymentId, amount: v.amount, method: v.method, raw: body });
}

export async function markPaymentFailed(paymentId: string, user: AuthUser, reason: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== user.id) throw notFound('Payment');
  if (p.status === 'CREATED') await prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 300) } });
}

// ───────────────────────────── Webhooks ─────────────────────────────

export async function handleWebhook(gateway: 'RAZORPAY' | 'CASHFREE', raw: Buffer, headers: Record<string, string | string[] | undefined>) {
  const gw = getGateway(gateway);
  const ev: GatewayEvent = gw.parseWebhook(raw, headers); // throws on bad signature
  const stored = await prisma.webhookEvent.upsert({
    where: { gateway_eventId: { gateway, eventId: ev.eventId } },
    create: { gateway, eventId: ev.eventId, eventType: ev.rawType, payload: ev.payload as Prisma.InputJsonValue },
    update: {},
  });
  if (stored.processedAt) return { duplicate: true };

  try {
    switch (ev.type) {
      case 'payment.captured':
        if (ev.orderId && ev.paymentId && ev.amount != null) {
          await capturePayment({ gateway, orderId: ev.orderId, gatewayPaymentId: ev.paymentId, amount: ev.amount, method: ev.method, raw: ev.payload });
        }
        break;
      case 'payment.failed':
        if (ev.orderId) {
          await prisma.payment.updateMany({ where: { gatewayOrderId: ev.orderId, status: 'CREATED' }, data: { status: 'FAILED', failureReason: ev.failureReason?.slice(0, 300) } });
        }
        break;
      case 'refund.processed':
      case 'refund.failed':
        if (ev.refundId) await settleRefund(ev.refundId, ev.type === 'refund.processed');
        break;
      default:
        break;
    }
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } });
  } catch (e) {
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { error: (e as Error).message.slice(0, 500) } });
    if (e instanceof AppError && e.status < 500) return { error: e.message };
    throw e;
  }
  return { ok: true };
}

// ───────────────────────────── Refunds ─────────────────────────────

/** Split a refund across captured payments (newest first), call gateways, update booking status. */
export async function initiateRefund(bookingId: string, amount: number, reason: string, actorId: string | null) {
  const payments = await prisma.payment.findMany({
    where: { bookingId, status: 'CAPTURED' },
    include: { refunds: { where: { status: { in: ['INITIATED', 'PROCESSED'] } } } },
    orderBy: { capturedAt: 'desc' },
  });
  let remaining = round2(amount);
  const plan: { payment: Payment; amount: number }[] = [];
  for (const p of payments) {
    if (remaining <= 0) break;
    const refundable = round2(num(p.amount) - p.refunds.reduce((a, r) => a + num(r.amount), 0));
    if (refundable <= 0) continue;
    const take = Math.min(refundable, remaining);
    plan.push({ payment: p, amount: round2(take) });
    remaining = round2(remaining - take);
  }
  if (!plan.length) return [];

  const refunds = await withTx(async (tx) => {
    const created = [];
    for (const item of plan) {
      created.push(await tx.refund.create({ data: { paymentId: item.payment.id, bookingId, amount: item.amount, reason: reason.slice(0, 300), initiatedById: actorId } }));
    }
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (b.status === 'CANCELLED') await transition(tx, b, 'REFUND_INITIATED', actorId, `Refund of ${formatINR(amount)} initiated`);
    return created;
  });

  for (const r of refunds) {
    const p = plan.find((x) => x.payment.id === r.paymentId)!.payment;
    if (p.gateway === 'CASH' || p.gateway === 'BANK_TRANSFER') continue; // processed manually by finance
    try {
      const gw = getGateway(p.gateway);
      const out = await gw.refund({ orderId: p.gatewayOrderId ?? '', paymentId: p.gatewayPaymentId ?? '', amount: num(r.amount), refundRef: `rf_${r.id}`.slice(0, 40), note: reason });
      await prisma.refund.update({ where: { id: r.id }, data: { gatewayRefundId: out.refundId } });
      if (out.processed) await settleRefund(out.refundId, true);
    } catch (e) {
      logger.error({ err: e, refundId: r.id }, 'gateway refund failed');
      await prisma.refund.update({ where: { id: r.id }, data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 300) } });
      void notifyAdmins('Refund failed', `Refund ${r.id} (${formatINR(num(r.amount))}) for booking ${bookingId} failed: ${(e as Error).message}`);
    }
  }
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { customer: true } });
  void notify({ userId: b.customerId, phone: b.customer.phone, email: b.customer.email }, 'REFUND_UPDATE', {
    amount: formatINR(amount),
    bookingNumber: b.bookingNumber,
    status: 'initiated',
  });
  return refunds;
}

/** Mark a refund processed/failed (webhook or manual) and move the booking to REFUNDED when all are done. */
export async function settleRefund(gatewayRefundIdOrId: string, success: boolean, actorId?: string) {
  const r = await prisma.refund.findFirst({ where: { OR: [{ gatewayRefundId: gatewayRefundIdOrId }, ...(isObjectId(gatewayRefundIdOrId) ? [{ id: gatewayRefundIdOrId }] : [])] } });
  if (!r || r.status === 'PROCESSED') return;
  await withTx(async (tx) => {
    await tx.refund.update({ where: { id: r.id }, data: success ? { status: 'PROCESSED', processedAt: new Date() } : { status: 'FAILED' } });
    if (!success) return;
    const pending = await tx.refund.count({ where: { bookingId: r.bookingId, status: 'INITIATED' } });
    const b = await tx.booking.findUniqueOrThrow({ where: { id: r.bookingId } });
    if (pending === 0 && b.status === 'REFUND_INITIATED') await transition(tx, b, 'REFUNDED', actorId ?? null, 'Refund processed');
  });
  if (success) {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: r.bookingId }, include: { customer: true } });
    void notify({ userId: b.customerId, phone: b.customer.phone, email: b.customer.email }, 'REFUND_UPDATE', {
      amount: formatINR(num(r.amount)),
      bookingNumber: b.bookingNumber,
      status: 'processed',
    });
  }
}

/** Driver/admin records an offline (cash / bank transfer) collection, typically the balance. */
export async function recordOfflinePayment(bookingId: string, actor: AuthUser, amount: number, gateway: 'CASH' | 'BANK_TRANSFER', reference?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw notFound('Booking');
  const due = amountDue(b, 'BALANCE');
  if (amount <= 0 || amount > due + 0.01) throw badRequest(`Amount must be between ₹1 and ₹${due}`);
  const purpose: PaymentPurpose = b.status === 'AWAITING_PAYMENT' ? 'ADVANCE' : 'BALANCE';
  const orderId = `${gateway.toLowerCase()}_${b.bookingNumber}_${Date.now()}`;
  await prisma.payment.create({ data: { bookingId, userId: b.customerId, gateway, purpose, amount, gatewayOrderId: orderId, status: 'CREATED', recordedById: actor.id, method: gateway.toLowerCase() } });
  return capturePayment({ gateway, orderId, gatewayPaymentId: reference ? `${orderId}:${reference}` : orderId, amount, method: gateway.toLowerCase() });
}
