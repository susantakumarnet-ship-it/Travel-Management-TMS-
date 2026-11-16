import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface DistanceResult {
  km: number;
  minutes: number;
  source: 'google' | 'estimate';
}

const cache = new Map<string, { at: number; v: DistanceResult }>();

/** Road distance between two free-text addresses using Google Distance Matrix. */
export async function roadDistance(origin: string, destination: string): Promise<DistanceResult | null> {
  if (!origin || !destination) return null;
  const key = `${origin.toLowerCase()}|${destination.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.v;
  if (!env.GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', origin);
    url.searchParams.set('destinations', destination);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as {
      rows?: { elements: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[];
    };
    const el = data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK' || !el.distance) return null;
    const v: DistanceResult = {
      km: Math.ceil(el.distance.value / 1000),
      minutes: Math.ceil((el.duration?.value ?? 0) / 60),
      source: 'google',
    };
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch (e) {
    logger.warn({ err: e }, 'distance matrix failed');
    return null;
  }
}

/** Great-circle distance × road factor; used when only coordinates are known. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 1.3);
}
