import { round2, toIstWall } from './util.js';

export type Period = 'day' | 'week' | 'month' | 'year';

/** ISO-8601 week number of an IST calendar date. */
function isoWeek(w: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7) };
}

/** Bucket key for a timestamp in IST: 2026-11-13 / 2026-W46 / 2026-11 / 2026 */
export function periodKey(d: Date, period: Period): string {
  const w = toIstWall(d);
  const iso = w.toISOString();
  if (period === 'day') return iso.slice(0, 10);
  if (period === 'month') return iso.slice(0, 7);
  if (period === 'year') return iso.slice(0, 4);
  const { year, week } = isoWeek(w);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Group rows by key, folding each group with `fold` into an accumulator created by `init`. */
export function groupFold<T, A>(rows: T[], key: (r: T) => string, init: () => A, fold: (acc: A, r: T) => void): Map<string, A> {
  const m = new Map<string, A>();
  for (const r of rows) {
    const k = key(r);
    let acc = m.get(k);
    if (!acc) m.set(k, (acc = init()));
    fold(acc, r);
  }
  return m;
}

export const sortedEntries = <A>(m: Map<string, A>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));

export const sum = <T>(rows: T[], f: (r: T) => number) => round2(rows.reduce((a, r) => a + (f(r) || 0), 0));

/** Revenue value of a booking: final bill when completed, otherwise quoted total. */
export const bookingValue = (b: { finalAmount: number | null; totalAmount: number }) => b.finalAmount ?? b.totalAmount;

export const CONFIRMED_STATUSES = ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'] as const;
export const CANCELLED_STATUSES = ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'] as const;
