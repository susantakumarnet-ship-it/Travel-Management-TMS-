import { beforeAll, describe, expect, it } from 'vitest';
import type { Quote } from '../src/modules/pricing/engine.js';

process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';
process.env.NODE_ENV = 'test';

let svc: typeof import('../src/modules/bookings/service.js');
let sm: typeof import('../src/modules/bookings/stateMachine.js');
beforeAll(async () => {
  svc = await import('../src/modules/bookings/service.js');
  sm = await import('../src/modules/bookings/stateMachine.js');
});

describe('booking state machine', () => {
  it('allows the happy path', () => {
    const path = ['AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(sm.canTransition(path[i], path[i + 1])).toBe(true);
  });
  it('blocks illegal jumps', () => {
    expect(sm.canTransition('AWAITING_PAYMENT', 'TRIP_STARTED')).toBe(false);
    expect(sm.canTransition('TRIP_COMPLETED', 'CANCELLED')).toBe(false);
    expect(sm.canTransition('TRIP_STARTED', 'CANCELLED')).toBe(false);
    expect(sm.canTransition('REFUNDED', 'CONFIRMED')).toBe(false);
  });
  it('supports the refund path', () => {
    expect(sm.canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(sm.canTransition('CANCELLED', 'REFUND_INITIATED')).toBe(true);
    expect(sm.canTransition('REFUND_INITIATED', 'REFUNDED')).toBe(true);
  });
});

describe('cancellationRefund', () => {
  const tiers = [
    { hoursBefore: 72, refundPercent: 100 },
    { hoursBefore: 24, refundPercent: 75 },
    { hoursBefore: 0, refundPercent: 0 },
  ];
  const now = new Date('2026-12-01T00:00:00Z');
  it('full refund well in advance', () => {
    const r = svc.cancellationRefund({ pickupAt: new Date('2026-12-05T00:00:00Z'), paidAmount: 2000 as never }, tiers, now);
    expect(r).toMatchObject({ refundPercent: 100, refundAmount: 2000, fee: 0 });
  });
  it('partial refund within 72h', () => {
    const r = svc.cancellationRefund({ pickupAt: new Date('2026-12-02T12:00:00Z'), paidAmount: 2000 as never }, tiers, now);
    expect(r).toMatchObject({ refundPercent: 75, refundAmount: 1500, fee: 500 });
  });
  it('no refund on the day', () => {
    const r = svc.cancellationRefund({ pickupAt: new Date('2026-12-01T05:00:00Z'), paidAmount: 2000 as never }, tiers, now);
    expect(r.refundAmount).toBe(0);
  });
});

describe('computeFinalBill', () => {
  const quote = {
    tripType: 'LOCAL_HOURLY', billedKm: 80, includedKm: 80, extraKm: 0, taxable: 2400, gstPercent: 5, passThrough: 0,
    lines: [{ code: 'BASE', label: 'Base', amount: 2400, taxable: true }],
  } as unknown as Quote;
  const b = { pickupAt: new Date('2026-12-02T04:30:00Z'), returnAt: new Date('2026-12-02T12:30:00Z'), tripType: 'LOCAL_HOURLY' as const, startOdometer: 10000, startedAt: new Date('2026-12-02T04:30:00Z') };
  const rates = { perKmRate: 12, extraKmRate: 13, extraHourRate: 150 };

  it('no extras when within limits', () => {
    const bill = svc.computeFinalBill(b, quote, rates, { endOdometer: 10070, tolls: 0, parking: 0 }, new Date('2026-12-02T12:40:00Z'));
    expect(bill.extraKm).toBe(0);
    expect(bill.extraHours).toBe(0); // 10-minute overrun is inside the 30-minute grace
    expect(bill.total).toBe(2520);
  });

  it('charges extra km, extra hours, and adds tolls/parking untaxed', () => {
    const bill = svc.computeFinalBill(b, quote, rates, { endOdometer: 10110, tolls: 150, parking: 50 }, new Date('2026-12-02T14:00:00Z'));
    expect(bill.actualKm).toBe(110);
    expect(bill.extraKm).toBe(30);
    expect(bill.extraKmCharge).toBe(390);
    expect(bill.extraHours).toBe(2); // 1.5h over → rounded up
    expect(bill.extraHourCharge).toBe(300);
    expect(bill.taxable).toBe(2400 + 390 + 300);
    expect(bill.gst).toBe(154.5);
    expect(bill.passThrough).toBe(200);
    expect(bill.total).toBe(3090 + 154.5 + 200);
  });
});
