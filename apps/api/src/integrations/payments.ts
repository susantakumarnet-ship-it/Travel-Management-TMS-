import Razorpay from 'razorpay';
import type { PaymentGateway } from '@prisma/client';
import { env, isProd } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { hmacBase64, hmacHex, safeEqual, shortId, toPaise, fromPaise } from '../lib/util.js';

/** Normalised result of a verified gateway event. */
export interface GatewayEvent {
  eventId: string;
  type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'refund.failed' | 'ignored';
  rawType: string;
  orderId?: string;
  paymentId?: string;
  refundId?: string;
  amount?: number; // INR
  method?: string;
  failureReason?: string;
  payload: unknown;
}

export interface CreateOrderInput {
  amount: number; // INR
  receipt: string;
  customer: { id: string; phone: string; name?: string | null; email?: string | null };
  notes: Record<string, string>;
}

export interface CreatedOrder {
  gateway: PaymentGateway;
  orderId: string;
  /** Everything the browser needs to open the gateway's checkout. */
  checkout: Record<string, unknown>;
}

export interface PaymentGatewayAdapter {
  name: PaymentGateway;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verifies the browser callback. Never trusted alone for capture amounts; we re-fetch or rely on webhook. */
  verifyCheckout(body: Record<string, string>): Promise<{ orderId: string; paymentId: string; amount: number; method?: string } | null>;
  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent;
  refund(args: { orderId: string; paymentId: string; amount: number; refundRef: string; note?: string }): Promise<{ refundId: string; processed: boolean }>;
}

const h = (headers: Record<string, string | string[] | undefined>, k: string) => {
  const v = headers[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

// ───────────────────────────── Razorpay ─────────────────────────────

class RazorpayAdapter implements PaymentGatewayAdapter {
  name = 'RAZORPAY' as const;
  private client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await this.client.orders.create({
      amount: toPaise(input.amount),
      currency: 'INR',
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return {
      gateway: 'RAZORPAY',
      orderId: order.id,
      checkout: {
        provider: 'razorpay',
        key: env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: 'INR',
        name: env.COMPANY_NAME,
        prefill: { name: input.customer.name ?? '', email: input.customer.email ?? '', contact: input.customer.phone },
      },
    };
  }

  async verifyCheckout(b: Record<string, string>) {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = b;
    if (!orderId || !paymentId || !sig) return null;
    const expected = hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    if (!safeEqual(expected, sig)) return null;
    const p = await this.client.payments.fetch(paymentId);
    if (p.order_id !== orderId || (p.status !== 'captured' && p.status !== 'authorized')) return null;
    return { orderId, paymentId, amount: fromPaise(Number(p.amount)), method: String(p.method ?? '') };
  }

  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent {
    const sig = h(headers, 'x-razorpay-signature');
    if (!sig || !env.RAZORPAY_WEBHOOK_SECRET || !safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), sig)) {
      throw new AppError(400, 'Invalid webhook signature', 'BAD_SIGNATURE');
    }
    const body = JSON.parse(raw.toString('utf8'));
    const eventId = h(headers, 'x-razorpay-event-id') ?? `${body.event}:${body.created_at}:${body.payload?.payment?.entity?.id ?? body.payload?.refund?.entity?.id}`;
    const pay = body.payload?.payment?.entity;
    const ref = body.payload?.refund?.entity;
    const base = { eventId, rawType: body.event as string, payload: body };
    switch (body.event) {
      case 'payment.captured':
      case 'order.paid':
        return { ...base, type: 'payment.captured', orderId: pay?.order_id, paymentId: pay?.id, amount: fromPaise(pay?.amount ?? 0), method: pay?.method };
      case 'payment.failed':
        return { ...base, type: 'payment.failed', orderId: pay?.order_id, paymentId: pay?.id, failureReason: pay?.error_description };
      case 'refund.processed':
        return { ...base, type: 'refund.processed', refundId: ref?.id, paymentId: ref?.payment_id, amount: fromPaise(ref?.amount ?? 0) };
      case 'refund.failed':
        return { ...base, type: 'refund.failed', refundId: ref?.id, paymentId: ref?.payment_id };
      default:
        return { ...base, type: 'ignored' };
    }
  }

  async refund(a: { paymentId: string; amount: number; refundRef: string; note?: string }) {
    const r = await this.client.payments.refund(a.paymentId, {
      amount: toPaise(a.amount),
      speed: 'normal',
      receipt: a.refundRef.slice(0, 40),
      notes: { reason: (a.note ?? '').slice(0, 250) },
    });
    return { refundId: r.id, processed: r.status === 'processed' };
  }
}

// ───────────────────────────── Cashfree ─────────────────────────────

class CashfreeAdapter implements PaymentGatewayAdapter {
  name = 'CASHFREE' as const;
  private base = env.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        'x-client-id': env.CASHFREE_APP_ID,
        'x-client-secret': env.CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new AppError(502, `Cashfree: ${data.message ?? res.status}`, 'GATEWAY_ERROR');
    return data;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const orderId = `${input.receipt}-${shortId()}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 45);
    const data = await this.call<{ order_id: string; payment_session_id: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        order_amount: input.amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: input.customer.id,
          customer_phone: input.customer.phone,
          customer_name: input.customer.name ?? undefined,
          customer_email: input.customer.email ?? undefined,
        },
        order_meta: { return_url: `${env.APP_URL}/account/bookings?cf_order={order_id}` },
        order_tags: input.notes,
      }),
    });
    return {
      gateway: 'CASHFREE',
      orderId: data.order_id,
      checkout: { provider: 'cashfree', mode: env.CASHFREE_ENV, paymentSessionId: data.payment_session_id, orderId: data.order_id },
    };
  }

  async verifyCheckout(b: Record<string, string>) {
    const orderId = b.order_id;
    if (!orderId) return null;
    const pays = await this.call<{ cf_payment_id: string | number; payment_status: string; payment_amount: number; payment_group?: string }[]>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
    );
    const ok = pays.find((p) => p.payment_status === 'SUCCESS');
    if (!ok) return null;
    return { orderId, paymentId: String(ok.cf_payment_id), amount: ok.payment_amount, method: ok.payment_group };
  }

  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent {
    const sig = h(headers, 'x-webhook-signature');
    const ts = h(headers, 'x-webhook-timestamp');
    if (!sig || !ts || !safeEqual(hmacBase64(env.CASHFREE_SECRET_KEY, ts + raw.toString('utf8')), sig)) {
      throw new AppError(400, 'Invalid webhook signature', 'BAD_SIGNATURE');
    }
    const body = JSON.parse(raw.toString('utf8'));
    const d = body.data ?? {};
    const base = { rawType: body.type as string, payload: body };
    switch (body.type) {
      case 'PAYMENT_SUCCESS_WEBHOOK':
        return { ...base, eventId: `pay:${d.payment?.cf_payment_id}:success`, type: 'payment.captured', orderId: d.order?.order_id, paymentId: String(d.payment?.cf_payment_id), amount: Number(d.payment?.payment_amount), method: d.payment?.payment_group };
      case 'PAYMENT_FAILED_WEBHOOK':
        return { ...base, eventId: `pay:${d.payment?.cf_payment_id}:failed`, type: 'payment.failed', orderId: d.order?.order_id, paymentId: String(d.payment?.cf_payment_id), failureReason: d.payment?.payment_message };
      case 'REFUND_STATUS_WEBHOOK': {
        const r = d.refund ?? {};
        return { ...base, eventId: `ref:${r.cf_refund_id}:${r.refund_status}`, type: r.refund_status === 'SUCCESS' ? 'refund.processed' : r.refund_status === 'CANCELLED' || r.refund_status === 'FAILED' ? 'refund.failed' : 'ignored', refundId: r.refund_id, amount: Number(r.refund_amount) };
      }
      default:
        return { ...base, eventId: `${body.type}:${ts}`, type: 'ignored' };
    }
  }

  async refund(a: { orderId: string; amount: number; refundRef: string; note?: string }) {
    const r = await this.call<{ refund_id: string; refund_status: string }>(`/orders/${encodeURIComponent(a.orderId)}/refunds`, {
      method: 'POST',
      body: JSON.stringify({ refund_amount: a.amount, refund_id: a.refundRef, refund_note: a.note?.slice(0, 100) }),
    });
    return { refundId: r.refund_id, processed: r.refund_status === 'SUCCESS' };
  }
}

// ───────────────────────── Development test gateway ─────────────────────────
// Lets the full booking → payment → confirmation flow be exercised locally without
// gateway credentials. The browser shows a clearly-labelled "TEST PAYMENT" screen.
// It is impossible to enable in production (see config/env.ts).

class TestGatewayAdapter implements PaymentGatewayAdapter {
  name = 'TEST' as const;
  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const orderId = `test_order_${shortId()}${shortId()}`;
    return { gateway: 'TEST', orderId, checkout: { provider: 'test', orderId, amount: toPaise(input.amount), currency: 'INR' } };
  }
  async verifyCheckout(b: Record<string, string>) {
    if (!b.test_order_id || !b.test_signature) return null;
    if (!safeEqual(hmacHex(env.JWT_ACCESS_SECRET, `test|${b.test_order_id}`), b.test_signature)) return null;
    return { orderId: b.test_order_id, paymentId: `test_pay_${shortId()}${shortId()}`, amount: Number(b.amount), method: 'test' };
  }
  parseWebhook(): GatewayEvent {
    throw new AppError(400, 'Test gateway has no webhooks', 'BAD_REQUEST');
  }
  async refund() {
    return { refundId: `test_rfnd_${shortId()}${shortId()}`, processed: true };
  }
}

/** Signature the dev test-checkout page must present (computed server-side, returned at order creation). */
export const testGatewaySignature = (orderId: string) => hmacHex(env.JWT_ACCESS_SECRET, `test|${orderId}`);

let razorpay: RazorpayAdapter | null = null;
let cashfree: CashfreeAdapter | null = null;
const testGw = new TestGatewayAdapter();

export function gatewayConfigured(name: 'razorpay' | 'cashfree'): boolean {
  return name === 'razorpay' ? !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) : !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
}

export function getGateway(name?: PaymentGateway): PaymentGatewayAdapter {
  const want = name ?? (env.PAYMENT_GATEWAY === 'cashfree' ? 'CASHFREE' : 'RAZORPAY');
  if (want === 'TEST') {
    if (isProd || !env.ALLOW_TEST_GATEWAY) throw new AppError(400, 'Test gateway disabled', 'GATEWAY_DISABLED');
    return testGw;
  }
  if (want === 'RAZORPAY' && gatewayConfigured('razorpay')) return (razorpay ??= new RazorpayAdapter());
  if (want === 'CASHFREE' && gatewayConfigured('cashfree')) return (cashfree ??= new CashfreeAdapter());
  if (!name && !isProd && env.ALLOW_TEST_GATEWAY) return testGw;
  throw new AppError(503, 'Online payments are not configured. Please contact support.', 'GATEWAY_NOT_CONFIGURED');
}
