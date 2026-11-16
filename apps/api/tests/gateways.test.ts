import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

// Configure env BEFORE importing modules that read it.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'mongodb+srv://u:p@x.mongodb.net/test',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0000',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-000',
  RAZORPAY_KEY_ID: 'rzp_test_dummy',
  RAZORPAY_KEY_SECRET: 'rzp_secret_dummy',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_razorpay_dummy',
  CASHFREE_APP_ID: 'cf_app_dummy',
  CASHFREE_SECRET_KEY: 'cf_secret_dummy',
  ALLOW_TEST_GATEWAY: 'true',
});

type PaymentsMod = typeof import('../src/integrations/payments.js');
let pay: PaymentsMod;
let svc: typeof import('../src/modules/payments/service.js');
let validate: typeof import('../src/lib/validate.js');
let ser: typeof import('../src/modules/vehicles/serialize.js');
let analytics: typeof import('../src/lib/analytics.js');

beforeAll(async () => {
  pay = await import('../src/integrations/payments.js');
  svc = await import('../src/modules/payments/service.js');
  validate = await import('../src/lib/validate.js');
  ser = await import('../src/modules/vehicles/serialize.js');
  analytics = await import('../src/lib/analytics.js');
});

const hmacHex = (k: string, d: string) => crypto.createHmac('sha256', k).update(d).digest('hex');
const hmacB64 = (k: string, d: string) => crypto.createHmac('sha256', k).update(d).digest('base64');

describe('Razorpay webhook verification', () => {
  const body = JSON.stringify({
    event: 'payment.captured',
    created_at: 1700000000,
    payload: { payment: { entity: { id: 'pay_123', order_id: 'order_abc', amount: 78500, method: 'upi' } } },
  });
  it('accepts a correctly signed event and maps it', () => {
    const ev = pay.getGateway('RAZORPAY').parseWebhook(Buffer.from(body), { 'x-razorpay-signature': hmacHex('whsec_razorpay_dummy', body), 'x-razorpay-event-id': 'evt_1' });
    expect(ev).toMatchObject({ eventId: 'evt_1', type: 'payment.captured', orderId: 'order_abc', paymentId: 'pay_123', amount: 785, method: 'upi' });
  });
  it('rejects a bad signature', () => {
    expect(() => pay.getGateway('RAZORPAY').parseWebhook(Buffer.from(body), { 'x-razorpay-signature': 'deadbeef' })).toThrow(/signature/i);
  });
  it('rejects a body tampered after signing', () => {
    const sig = hmacHex('whsec_razorpay_dummy', body);
    const tampered = body.replace('78500', '100');
    expect(() => pay.getGateway('RAZORPAY').parseWebhook(Buffer.from(tampered), { 'x-razorpay-signature': sig })).toThrow(/signature/i);
  });
  it('maps refund.processed', () => {
    const b = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_123', amount: 50000 } } } });
    const ev = pay.getGateway('RAZORPAY').parseWebhook(Buffer.from(b), { 'x-razorpay-signature': hmacHex('whsec_razorpay_dummy', b), 'x-razorpay-event-id': 'evt_2' });
    expect(ev).toMatchObject({ type: 'refund.processed', refundId: 'rfnd_1', amount: 500 });
  });
  it('ignores unrelated events', () => {
    const b = JSON.stringify({ event: 'subscription.charged', payload: {} });
    const ev = pay.getGateway('RAZORPAY').parseWebhook(Buffer.from(b), { 'x-razorpay-signature': hmacHex('whsec_razorpay_dummy', b) });
    expect(ev.type).toBe('ignored');
  });
});

describe('Cashfree webhook verification', () => {
  const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'RR-1-A' }, payment: { cf_payment_id: 991, payment_amount: 785.5, payment_group: 'upi' } } });
  const ts = '1700000000';
  it('accepts a correctly signed event', () => {
    const ev = pay.getGateway('CASHFREE').parseWebhook(Buffer.from(body), { 'x-webhook-signature': hmacB64('cf_secret_dummy', ts + body), 'x-webhook-timestamp': ts });
    expect(ev).toMatchObject({ type: 'payment.captured', orderId: 'RR-1-A', paymentId: '991', amount: 785.5 });
  });
  it('rejects a signature computed without the timestamp', () => {
    expect(() =>
      pay.getGateway('CASHFREE').parseWebhook(Buffer.from(body), { 'x-webhook-signature': hmacB64('cf_secret_dummy', body), 'x-webhook-timestamp': ts }),
    ).toThrow(/signature/i);
  });
  it('maps refund status', () => {
    const b = JSON.stringify({ type: 'REFUND_STATUS_WEBHOOK', data: { refund: { cf_refund_id: 7, refund_id: 'rf_x', refund_status: 'SUCCESS', refund_amount: 200 } } });
    const ev = pay.getGateway('CASHFREE').parseWebhook(Buffer.from(b), { 'x-webhook-signature': hmacB64('cf_secret_dummy', ts + b), 'x-webhook-timestamp': ts });
    expect(ev).toMatchObject({ type: 'refund.processed', refundId: 'rf_x' });
  });
});

describe('Test gateway', () => {
  it('only accepts the server-issued signature', async () => {
    const gw = pay.getGateway('TEST');
    const order = await gw.createOrder({ amount: 100, receipt: 'r', customer: { id: 'c', phone: '9999999999' }, notes: {} });
    const good = await gw.verifyCheckout({ test_order_id: order.orderId, test_signature: pay.testGatewaySignature(order.orderId), amount: '100' });
    expect(good?.orderId).toBe(order.orderId);
    expect(await gw.verifyCheckout({ test_order_id: order.orderId, test_signature: 'x'.repeat(64), amount: '100' })).toBeNull();
    expect(await gw.verifyCheckout({ test_order_id: 'other', test_signature: pay.testGatewaySignature(order.orderId), amount: '100' })).toBeNull();
  });
});

describe('amountDue', () => {
  const b = { status: 'AWAITING_PAYMENT', advanceAmount: 785, totalAmount: 3137.4, finalAmount: null, paidAmount: 0 };
  it('advance / full / balance', () => {
    expect(svc.amountDue(b, 'ADVANCE')).toBe(785);
    expect(svc.amountDue(b, 'FULL')).toBe(3137.4);
    expect(svc.amountDue({ ...b, paidAmount: 785 }, 'BALANCE')).toBe(2352.4);
    expect(svc.amountDue({ ...b, paidAmount: 785, finalAmount: 3500 }, 'BALANCE')).toBe(2715);
    expect(svc.amountDue({ ...b, paidAmount: 4000 }, 'BALANCE')).toBe(0);
  });
});

describe('validators & formatting', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['98765-43210', '9876543210'],
  ])('accepts phone %s', (input, out) => expect(validate.zPhone.parse(input)).toBe(out));
  it.each(['12345', '5876543210', '98765432101', 'abcdefghij'])('rejects phone %s', (input) => expect(validate.zPhone.safeParse(input).success).toBe(false));
  it('strips HTML from free text', () => expect(validate.zText(200).parse('<script>alert(1)</script>Hello <b>there</b>')).toBe('alert(1)Hello there'));
  it('masks registration numbers', () => {
    expect(ser.maskRegistration('OD02AB1234')).toBe('OD 02 •• 1234');
    expect(ser.maskRegistration('od 02 ab 1234')).toBe('OD 02 •• 1234');
  });
  it('buckets IST periods incl. ISO week across year end', () => {
    const d = new Date('2026-12-31T20:00:00Z'); // 1 Jan 2027 01:30 IST
    expect(analytics.periodKey(d, 'day')).toBe('2027-01-01');
    expect(analytics.periodKey(d, 'month')).toBe('2027-01');
    expect(analytics.periodKey(d, 'week')).toBe('2026-W53');
    expect(analytics.periodKey(new Date('2026-11-13T06:00:00Z'), 'week')).toBe('2026-W46');
  });
});
