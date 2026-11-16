import { describe, expect, it } from 'vitest';
import { calculateQuote, dayMultiplier, nightsSpanned, refundPercentFor, tripDays, type PricingRuleInput, type VehicleRates } from '../src/modules/pricing/engine.js';

const rates: VehicleRates = {
  categoryId: 'sedan',
  perKmRate: 12,
  perDayRate: 2500,
  perHourRate: 300,
  minBookingHours: 4,
  includedKmPerDay: 250,
  includedKmPerHour: 10,
  extraKmRate: 13,
  extraHourRate: 150,
  driverAllowancePerDay: 300,
  nightChargePerNight: 250,
  decorationCharge: 3000,
  securityDeposit: 5000,
  selfDrivePerDayRate: 1800,
  decorationAvailable: true,
};
const settings = { gstPercent: 5, advancePercent: 25, nightStartHour: 22, nightEndHour: 6, outstationMinKmPerDay: 250, homeState: 'Odisha' };
/** Build a Date from an IST wall-clock time. */
const ist = (s: string) => new Date(`${s}+05:30`);

describe('tripDays / nightsSpanned', () => {
  it('same-day trip touches one day and no nights', () => {
    expect(tripDays(ist('2026-12-02T09:00:00'), ist('2026-12-02T18:00:00'))).toHaveLength(1);
    expect(nightsSpanned(ist('2026-12-02T09:00:00'), ist('2026-12-02T18:00:00'))).toBe(0);
  });
  it('3-day outstation spans 2 nights', () => {
    expect(nightsSpanned(ist('2026-12-02T06:00:00'), ist('2026-12-04T20:00:00'))).toBe(2);
  });
  it('return exactly at midnight does not count the next day', () => {
    expect(tripDays(ist('2026-12-02T10:00:00'), ist('2026-12-03T00:00:00'))).toHaveLength(1);
  });
});

describe('calculateQuote', () => {
  it('local hourly enforces the minimum booking hours', () => {
    const q = calculateQuote(rates, { tripType: 'LOCAL_HOURLY', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T12:00:00'), estimatedKm: 20, withDriver: true }, [], settings);
    expect(q.lines.find((l) => l.code === 'BASE')!.amount).toBe(4 * 300);
    expect(q.includedKm).toBe(40);
    expect(q.extraKm).toBe(0);
    expect(q.gst).toBe(60);
    expect(q.total).toBe(1260);
    expect(q.notes.join(' ')).toMatch(/Minimum booking is 4 hours/);
  });

  it('local hourly charges extra km beyond the included allowance', () => {
    const q = calculateQuote(rates, { tripType: 'LOCAL_HOURLY', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T18:00:00'), estimatedKm: 100, withDriver: true }, [], settings);
    expect(q.includedKm).toBe(80);
    expect(q.extraKm).toBe(20);
    expect(q.lines.find((l) => l.code === 'EXTRA_KM')!.amount).toBe(260);
  });

  it('outstation bills the per-day minimum km, driver allowance and night halts', () => {
    const q = calculateQuote(rates, { tripType: 'OUTSTATION', pickupAt: ist('2026-12-02T06:00:00'), returnAt: ist('2026-12-04T20:00:00'), estimatedKm: 400, withDriver: true }, [], settings);
    expect(q.days).toBe(3);
    expect(q.billedKm).toBe(750); // 3 × 250 > 400
    expect(q.lines.find((l) => l.code === 'BASE')!.amount).toBe(750 * 12);
    expect(q.lines.find((l) => l.code === 'DRIVER')!.amount).toBe(900);
    expect(q.lines.find((l) => l.code === 'NIGHT')!.amount).toBe(500);
    expect(q.subtotal).toBe(9000 + 900 + 500);
  });

  it('airport transfer applies the minimum fare for short distances', () => {
    const q = calculateQuote(rates, { tripType: 'AIRPORT_TRANSFER', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T11:30:00'), estimatedKm: 15, withDriver: true }, [], settings);
    expect(q.lines.find((l) => l.code === 'BASE')!.amount).toBe(600);
  });

  it('night driving surcharge applies to an early-morning airport pickup', () => {
    const q = calculateQuote(rates, { tripType: 'AIRPORT_TRANSFER', pickupAt: ist('2026-12-02T04:30:00'), returnAt: ist('2026-12-02T06:30:00'), estimatedKm: 30, withDriver: true }, [], settings);
    expect(q.lines.find((l) => l.code === 'NIGHT')?.amount).toBe(250);
  });

  it('self-drive uses the self-drive rate and reports a deposit, no driver charges', () => {
    const q = calculateQuote(rates, { tripType: 'MULTI_DAY', pickupAt: ist('2026-12-02T09:00:00'), returnAt: ist('2026-12-04T09:00:00'), estimatedKm: 300, withDriver: false }, [], settings);
    expect(q.tripType).toBe('SELF_DRIVE');
    expect(q.lines.find((l) => l.code === 'BASE')!.amount).toBe(2 * 1800);
    expect(q.lines.find((l) => l.code === 'DRIVER')).toBeUndefined();
    expect(q.securityDeposit).toBe(5000);
  });

  it('weekend multiplier is averaged over trip days', () => {
    const weekend: PricingRuleInput = { id: 'w', name: 'Weekend', type: 'WEEKEND', categoryId: null, startDate: null, endDate: null, daysOfWeek: [0, 6], multiplier: 1.2, flatAmount: null, state: null, config: null, priority: 0 };
    // Fri 2026-12-04 → Sun 2026-12-06: Fri ×1, Sat ×1.2, Sun ×1.2 → avg 1.13
    const q = calculateQuote(rates, { tripType: 'MULTI_DAY', pickupAt: ist('2026-12-04T09:00:00'), returnAt: ist('2026-12-06T21:00:00'), estimatedKm: 0, withDriver: true }, [weekend], settings);
    expect(q.multiplier).toBe(1.13);
    const base = q.lines.find((l) => l.code === 'BASE')!.amount;
    expect(q.lines.find((l) => l.code === 'DYNAMIC')!.amount).toBeCloseTo(base * 0.13, 2);
  });

  it('category-scoped rules do not affect other categories', () => {
    const rule: PricingRuleInput = { id: 's', name: 'Wedding season', type: 'SEASONAL', categoryId: 'luxury', startDate: new Date('2026-11-01'), endDate: new Date('2027-02-28'), daysOfWeek: [], multiplier: 1.5, flatAmount: null, state: null, config: null, priority: 0 };
    expect(dayMultiplier(new Date('2026-12-02'), [rule], 'sedan')).toBe(1);
    expect(dayMultiplier(new Date('2026-12-02'), [rule], 'luxury')).toBe(1.5);
  });

  it('decoration, state tax, tolls, coupon and GST are combined correctly', () => {
    const stateTax: PricingRuleInput = { id: 't', name: 'AP entry', type: 'STATE_TAX', categoryId: null, startDate: null, endDate: null, daysOfWeek: [], multiplier: null, flatAmount: 800, state: 'Andhra Pradesh', config: null, priority: 0 };
    const q = calculateQuote(
      rates,
      { tripType: 'LOCAL_HOURLY', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T18:00:00'), estimatedKm: 80, withDriver: true, decoration: true, destinationState: 'Andhra Pradesh', estimatedTolls: 200, discount: 500, discountLabel: 'Coupon WED500' },
      [stateTax],
      settings,
    );
    // taxable: base 2400 + decoration 3000 = 5400 − 500 discount = 4900; GST 245
    expect(q.subtotal).toBe(5400);
    expect(q.discount).toBe(500);
    expect(q.taxable).toBe(4900);
    expect(q.gst).toBe(245);
    expect(q.passThrough).toBe(1000); // 800 state tax + 200 tolls, untaxed
    expect(q.total).toBe(6145);
    expect(q.advance).toBe(Math.ceil(6145 * 0.25));
  });

  it('discount can never exceed the subtotal', () => {
    const q = calculateQuote(rates, { tripType: 'LOCAL_HOURLY', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T14:00:00'), estimatedKm: 0, withDriver: true, discount: 99999 }, [], settings);
    expect(q.taxable).toBe(0);
    expect(q.total).toBe(0);
  });

  it('rejects return before pickup', () => {
    expect(() => calculateQuote(rates, { tripType: 'LOCAL_HOURLY', pickupAt: ist('2026-12-02T10:00:00'), returnAt: ist('2026-12-02T09:00:00'), estimatedKm: 0, withDriver: true }, [], settings)).toThrow();
  });
});

describe('refundPercentFor', () => {
  const tiers = [
    { hoursBefore: 72, refundPercent: 100 },
    { hoursBefore: 24, refundPercent: 75 },
    { hoursBefore: 6, refundPercent: 50 },
    { hoursBefore: 0, refundPercent: 0 },
  ];
  it.each([
    [100, 100],
    [72, 100],
    [48, 75],
    [24, 75],
    [10, 50],
    [2, 0],
    [-5, 0],
  ])('%d hours before → %d%%', (h, pct) => expect(refundPercentFor(h, tiers)).toBe(pct));
});
