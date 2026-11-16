import { prisma } from './prisma.js';

/** Typed system settings with defaults. Admins edit them via /api/admin/settings (no code change). */
export const SETTING_DEFAULTS = {
  'booking.advancePercent': 25,
  'booking.holdMinutes': 20,
  'booking.minLeadHours': 2,
  'booking.ownerAutoAccept': true,
  /** Gap kept free after every trip for cleaning/repositioning */
  'booking.bufferMinutes': 60,
  'tax.gstPercent': 5,
  'tax.sacCode': '996601',
  'commission.defaultPercent': 15,
  'pricing.nightStartHour': 22,
  'pricing.nightEndHour': 6,
  'pricing.outstationMinKmPerDay': 250,
  'cancellation.tiers': [
    { hoursBefore: 72, refundPercent: 100 },
    { hoursBefore: 24, refundPercent: 75 },
    { hoursBefore: 6, refundPercent: 50 },
    { hoursBefore: 0, refundPercent: 0 },
  ] as { hoursBefore: number; refundPercent: number }[],
  'contact.phone': '+91 90000 00000',
  'contact.email': 'hello@royalride.example',
  'contact.whatsapp': '919000000000',
  'contact.address': 'Plot 42, Saheed Nagar, Bhubaneswar, Odisha 751007',
  'reminders.documentExpiryDays': [30, 15, 7, 1] as number[],
  'reminders.pickupHoursBefore': 3,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] };

let cache: { at: number; values: Record<string, unknown> } | null = null;
const TTL = 30_000;

export async function getSettings(): Promise<Settings> {
  if (!cache || Date.now() - cache.at > TTL) {
    const rows = await prisma.setting.findMany();
    cache = { at: Date.now(), values: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }
  return { ...SETTING_DEFAULTS, ...cache.values } as Settings;
}

export function invalidateSettings() {
  cache = null;
}
