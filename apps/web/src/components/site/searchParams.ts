import { toLocalInput } from '@/lib/format';

/** Search params carried between home → /vehicles → /vehicles/[slug] → /book/[id]. */
export const JOURNEY_KEYS = [
  'city',
  'pickupLocation',
  'dropLocation',
  'pickupAt',
  'returnAt',
  'purpose',
  'passengers',
  'luggage',
  'ac',
  'withDriver',
  'decoration',
  'estimatedKm',
  'travelPackageId',
] as const;

export type ParamRecord = Record<string, string | string[] | undefined>;

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Flatten Next's searchParams record into a plain string map (drops empties). */
export function flatParams(sp: ParamRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const f = firstParam(v);
    if (f !== undefined && f !== '') out[k] = f;
  }
  return out;
}

export function toQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Keep only journey-related keys (used when linking to details / checkout). */
export function journeyQuery(params: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const k of JOURNEY_KEYS) if (params[k]) out[k] = params[k];
  return toQueryString(out);
}

/** ISO → { date: 'YYYY-MM-DD', time: 'HH:mm' } in IST. */
export function isoToIstParts(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const v = toLocalInput(d);
  return { date: v.slice(0, 10), time: v.slice(11, 16) };
}

export function validIso(v?: string | null) {
  return !!v && !Number.isNaN(new Date(v).getTime());
}
