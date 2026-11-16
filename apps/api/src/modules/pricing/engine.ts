/**
 * Royal Ride dynamic pricing engine — a pure function (no I/O) so it is fully unit-testable.
 *
 * Fare models by trip type
 *  LOCAL_HOURLY      max(hours, minBookingHours) × perHourRate; includes hours × includedKmPerHour
 *  AIRPORT_TRANSFER  max(km × perKmRate, 2 × perHourRate) one-way transfer
 *  OUTSTATION        max(km, days × minKmPerDay) × perKmRate + driver allowance + night halts
 *  MULTI_DAY         days × perDayRate; includes days × includedKmPerDay (+ driver allowance, night halts)
 *  SELF_DRIVE        days × selfDrivePerDayRate; includes days × includedKmPerDay; refundable deposit
 *
 * Then: seasonal / weekend / peak-date multipliers (averaged per trip day) apply to the base fare,
 * flat surcharges are added (decoration, state entry tax, waiting, night driving), coupon discount
 * is taken off the taxable amount, GST is applied, and tolls/parking estimates are added untaxed.
 */

export type TripType = 'LOCAL_HOURLY' | 'OUTSTATION' | 'AIRPORT_TRANSFER' | 'MULTI_DAY' | 'SELF_DRIVE';

export interface VehicleRates {
  categoryId: string;
  perKmRate: number;
  perDayRate: number;
  perHourRate: number;
  minBookingHours: number;
  includedKmPerDay: number;
  includedKmPerHour: number;
  extraKmRate: number;
  extraHourRate: number;
  driverAllowancePerDay: number;
  nightChargePerNight: number;
  decorationCharge: number;
  securityDeposit: number;
  selfDrivePerDayRate: number | null;
  decorationAvailable: boolean;
}

export interface PricingRuleInput {
  id: string;
  name: string;
  type: 'SEASONAL' | 'WEEKEND' | 'NIGHT' | 'STATE_TAX' | 'WAITING' | 'PEAK_DATE';
  categoryId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  daysOfWeek: number[];
  multiplier: number | null;
  flatAmount: number | null;
  state: string | null;
  config: Record<string, unknown> | null;
  priority: number;
}

export interface PricingSettings {
  gstPercent: number;
  advancePercent: number;
  nightStartHour: number;
  nightEndHour: number;
  outstationMinKmPerDay: number;
  homeState: string;
}

export interface QuoteInput {
  tripType: TripType;
  pickupAt: Date;
  returnAt: Date;
  estimatedKm: number;
  withDriver: boolean;
  decoration?: boolean;
  destinationState?: string | null;
  waitingHours?: number;
  estimatedTolls?: number;
  estimatedParking?: number;
  /** Discount already computed for a coupon (INR, pre-tax). */
  discount?: number;
  discountLabel?: string;
}

export interface PriceLine {
  code: string;
  label: string;
  amount: number;
  taxable: boolean;
  detail?: string;
}

export interface Quote {
  tripType: TripType;
  hours: number;
  days: number;
  billedKm: number;
  includedKm: number;
  extraKm: number;
  nights: number;
  multiplier: number;
  lines: PriceLine[];
  subtotal: number; // taxable before discount
  discount: number;
  taxable: number;
  gstPercent: number;
  gst: number;
  passThrough: number; // tolls/parking estimates (no GST)
  total: number;
  advance: number;
  securityDeposit: number;
  notes: string[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const IST = 330 * 60_000;
const istWall = (d: Date) => new Date(d.getTime() + IST);
const dayKey = (d: Date) => istWall(d).toISOString().slice(0, 10);

/** Distinct IST calendar days touched by the trip (inclusive). */
export function tripDays(pickupAt: Date, returnAt: Date): Date[] {
  const out: Date[] = [];
  const start = istWall(pickupAt);
  start.setUTCHours(0, 0, 0, 0);
  const endKey = dayKey(new Date(returnAt.getTime() - 1));
  for (let d = start; ; d = new Date(d.getTime() + 86_400_000)) {
    out.push(new Date(d));
    if (d.toISOString().slice(0, 10) >= endKey || out.length > 366) break;
  }
  return out; // UTC-midnight dates representing IST calendar days
}

/** Number of IST midnights crossed (night halts for a driver). */
export function nightsSpanned(pickupAt: Date, returnAt: Date): number {
  return Math.max(0, tripDays(pickupAt, returnAt).length - 1);
}

function inNightWindow(d: Date, startHour: number, endHour: number): boolean {
  const h = istWall(d).getUTCHours();
  return startHour > endHour ? h >= startHour || h < endHour : h >= startHour && h < endHour;
}

function ruleApplies(rule: PricingRuleInput, categoryId: string) {
  return !rule.categoryId || rule.categoryId === categoryId;
}

function dateInRule(day: Date, rule: PricingRuleInput) {
  const k = day.toISOString().slice(0, 10);
  const s = rule.startDate ? rule.startDate.toISOString().slice(0, 10) : null;
  const e = rule.endDate ? rule.endDate.toISOString().slice(0, 10) : null;
  return (!s || k >= s) && (!e || k <= e);
}

/** Average of per-day multipliers. Within a day, the highest seasonal/peak rule and the weekend rule stack. */
export function dayMultiplier(day: Date, rules: PricingRuleInput[], categoryId: string): number {
  const dow = day.getUTCDay();
  let seasonal = 1;
  let weekend = 1;
  for (const rule of rules) {
    if (!ruleApplies(rule, categoryId) || rule.multiplier == null) continue;
    if ((rule.type === 'SEASONAL' || rule.type === 'PEAK_DATE') && dateInRule(day, rule)) {
      seasonal = Math.max(seasonal, rule.multiplier);
    } else if (rule.type === 'WEEKEND' && rule.daysOfWeek.includes(dow) && dateInRule(day, rule)) {
      weekend = Math.max(weekend, rule.multiplier);
    }
  }
  return seasonal * weekend;
}

export function calculateQuote(
  v: VehicleRates,
  input: QuoteInput,
  rules: PricingRuleInput[],
  s: PricingSettings,
): Quote {
  if (!(input.returnAt > input.pickupAt)) throw new Error('Return time must be after pickup time');
  const ms = input.returnAt.getTime() - input.pickupAt.getTime();
  const hours = Math.ceil(ms / 3_600_000);
  const days = Math.max(1, Math.ceil(hours / 24));
  const km = Math.max(0, Math.round(input.estimatedKm || 0));
  const lines: PriceLine[] = [];
  const notes: string[] = [];
  let billedKm = km;
  let includedKm = 0;
  let extraKm = 0;
  let nights = 0;
  let base = 0;
  let baseLabel = '';
  let extraKmCharge = 0;

  const tripType: TripType = !input.withDriver ? 'SELF_DRIVE' : input.tripType === 'SELF_DRIVE' ? 'MULTI_DAY' : input.tripType;

  switch (tripType) {
    case 'LOCAL_HOURLY': {
      const billedHours = Math.max(hours, v.minBookingHours);
      base = billedHours * v.perHourRate;
      baseLabel = `${billedHours} hr × ₹${v.perHourRate}/hr`;
      includedKm = billedHours * v.includedKmPerHour;
      extraKm = Math.max(0, km - includedKm);
      extraKmCharge = extraKm * v.extraKmRate;
      if (hours < v.minBookingHours) notes.push(`Minimum booking is ${v.minBookingHours} hours.`);
      break;
    }
    case 'AIRPORT_TRANSFER': {
      const kmFare = km * v.perKmRate;
      const minFare = 2 * v.perHourRate;
      base = Math.max(kmFare, minFare);
      baseLabel = kmFare >= minFare ? `${km} km × ₹${v.perKmRate}/km` : 'Minimum transfer fare';
      includedKm = km;
      if (hours > 3) notes.push('Airport transfers include up to 3 hours; extra time is billed as waiting.');
      break;
    }
    case 'OUTSTATION': {
      billedKm = Math.max(km, days * s.outstationMinKmPerDay);
      base = billedKm * v.perKmRate;
      baseLabel = `${billedKm} km × ₹${v.perKmRate}/km`;
      includedKm = billedKm;
      if (billedKm > km) notes.push(`Outstation trips are billed for a minimum of ${s.outstationMinKmPerDay} km per day.`);
      nights = nightsSpanned(input.pickupAt, input.returnAt);
      break;
    }
    case 'MULTI_DAY': {
      base = days * v.perDayRate;
      baseLabel = `${days} day × ₹${v.perDayRate}/day`;
      includedKm = days * v.includedKmPerDay;
      extraKm = Math.max(0, km - includedKm);
      extraKmCharge = extraKm * v.extraKmRate;
      nights = nightsSpanned(input.pickupAt, input.returnAt);
      break;
    }
    case 'SELF_DRIVE': {
      const rate = v.selfDrivePerDayRate ?? v.perDayRate;
      base = days * rate;
      baseLabel = `${days} day × ₹${rate}/day (self drive)`;
      includedKm = days * v.includedKmPerDay;
      extraKm = Math.max(0, km - includedKm);
      extraKmCharge = extraKm * v.extraKmRate;
      break;
    }
  }

  // Seasonal / weekend / peak multipliers apply to time & distance fare.
  const tdays = tripDays(input.pickupAt, input.returnAt);
  const multiplier = r2(tdays.reduce((acc, d) => acc + dayMultiplier(d, rules, v.categoryId), 0) / tdays.length);

  lines.push({ code: 'BASE', label: 'Base fare', amount: r2(base), taxable: true, detail: baseLabel });
  if (extraKmCharge > 0) {
    lines.push({ code: 'EXTRA_KM', label: 'Extra kilometres', amount: r2(extraKmCharge), taxable: true, detail: `${extraKm} km × ₹${v.extraKmRate}/km` });
  }
  if (multiplier !== 1) {
    const adj = r2((base + extraKmCharge) * (multiplier - 1));
    const names = Array.from(
      new Set(
        rules
          .filter((r) => ruleApplies(r, v.categoryId) && r.multiplier != null && ['SEASONAL', 'WEEKEND', 'PEAK_DATE'].includes(r.type))
          .filter((r) => tdays.some((d) => (r.type === 'WEEKEND' ? r.daysOfWeek.includes(d.getUTCDay()) : true) && dateInRule(d, r)))
          .map((r) => r.name),
      ),
    );
    lines.push({
      code: 'DYNAMIC',
      label: adj >= 0 ? 'Seasonal / weekend surcharge' : 'Seasonal discount',
      amount: adj,
      taxable: true,
      detail: `${names.join(', ')} (×${multiplier})`,
    });
  }

  if (input.withDriver && tripType !== 'LOCAL_HOURLY' && tripType !== 'AIRPORT_TRANSFER' && v.driverAllowancePerDay > 0) {
    lines.push({ code: 'DRIVER', label: 'Driver allowance', amount: r2(days * v.driverAllowancePerDay), taxable: true, detail: `${days} day × ₹${v.driverAllowancePerDay}` });
  }

  // Night charges: driver night halts on multi-day trips, or a night-driving surcharge for short trips.
  const nightRule = rules.filter((r) => r.type === 'NIGHT' && ruleApplies(r, v.categoryId)).sort((a, b) => b.priority - a.priority)[0];
  const nStart = Number(nightRule?.config?.startHour ?? s.nightStartHour);
  const nEnd = Number(nightRule?.config?.endHour ?? s.nightEndHour);
  const nightRate = nightRule?.flatAmount ?? v.nightChargePerNight;
  if (input.withDriver && nightRate > 0) {
    if (nights > 0) {
      lines.push({ code: 'NIGHT', label: 'Driver night charges', amount: r2(nights * nightRate), taxable: true, detail: `${nights} night × ₹${nightRate}` });
    } else if (inNightWindow(input.pickupAt, nStart, nEnd) || inNightWindow(input.returnAt, nStart, nEnd)) {
      lines.push({ code: 'NIGHT', label: 'Night driving charge', amount: r2(nightRate), taxable: true, detail: `Between ${nStart}:00 and ${nEnd}:00` });
    }
  }

  if (input.decoration) {
    if (!v.decorationAvailable) notes.push('Decoration is not offered for this vehicle.');
    else if (v.decorationCharge > 0) lines.push({ code: 'DECORATION', label: 'Wedding decoration', amount: r2(v.decorationCharge), taxable: true });
  }

  if (input.waitingHours && input.waitingHours > 0) {
    const wr = rules.find((r) => r.type === 'WAITING' && ruleApplies(r, v.categoryId));
    const free = Number(wr?.config?.freeMinutes ?? 0) / 60;
    const rate = Number(wr?.config?.perHour ?? v.extraHourRate);
    const billable = Math.max(0, Math.ceil(input.waitingHours - free));
    if (billable > 0) lines.push({ code: 'WAITING', label: 'Waiting charges', amount: r2(billable * rate), taxable: true, detail: `${billable} hr × ₹${rate}` });
  }

  if (input.destinationState && input.destinationState.toLowerCase() !== s.homeState.toLowerCase()) {
    const st = rules
      .filter((r) => r.type === 'STATE_TAX' && ruleApplies(r, v.categoryId) && (r.state ?? '').toLowerCase() === input.destinationState!.toLowerCase())
      .sort((a, b) => b.priority - a.priority)[0];
    if (st?.flatAmount) {
      const perDay = st.config?.perDay === true;
      lines.push({ code: 'STATE_TAX', label: `${st.state} entry / permit tax`, amount: r2(perDay ? st.flatAmount * days : st.flatAmount), taxable: false, detail: perDay ? `${days} day × ₹${st.flatAmount}` : undefined });
    } else {
      notes.push(`Interstate permit tax for ${input.destinationState} is payable at actuals.`);
    }
  }

  const tolls = Math.max(0, input.estimatedTolls ?? 0);
  const parking = Math.max(0, input.estimatedParking ?? 0);
  if (tolls > 0) lines.push({ code: 'TOLL', label: 'Toll charges (estimate)', amount: r2(tolls), taxable: false });
  if (parking > 0) lines.push({ code: 'PARKING', label: 'Parking charges (estimate)', amount: r2(parking), taxable: false });
  if (input.withDriver && tolls === 0) notes.push('Tolls and parking, if any, are charged at actuals on the final bill.');

  const subtotal = r2(lines.filter((l) => l.taxable).reduce((a, l) => a + l.amount, 0));
  const discount = r2(Math.min(Math.max(0, input.discount ?? 0), subtotal));
  if (discount > 0) lines.push({ code: 'DISCOUNT', label: input.discountLabel ?? 'Discount', amount: -discount, taxable: true });
  const taxable = r2(subtotal - discount);
  const gst = r2((taxable * s.gstPercent) / 100);
  const passThrough = r2(lines.filter((l) => !l.taxable).reduce((a, l) => a + l.amount, 0));
  const total = r2(taxable + gst + passThrough);
  const advance = total <= 500 ? total : Math.min(total, Math.max(500, Math.ceil((total * s.advancePercent) / 100)));
  const securityDeposit = tripType === 'SELF_DRIVE' ? v.securityDeposit : 0;
  if (securityDeposit > 0) notes.push(`A refundable security deposit of ₹${securityDeposit} is collected at pickup.`);

  return {
    tripType,
    hours,
    days,
    billedKm,
    includedKm,
    extraKm,
    nights,
    multiplier,
    lines,
    subtotal,
    discount,
    taxable,
    gstPercent: s.gstPercent,
    gst,
    passThrough,
    total,
    advance,
    securityDeposit,
    notes,
  };
}

/** Refund % for a cancellation `hoursBefore` pickup, using admin-configured tiers. */
export function refundPercentFor(hoursBefore: number, tiers: { hoursBefore: number; refundPercent: number }[]): number {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (const t of sorted) if (hoursBefore >= t.hoursBefore) return t.refundPercent;
  return 0;
}
