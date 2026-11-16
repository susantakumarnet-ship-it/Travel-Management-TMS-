import type { SiteConfig } from '@/lib/types';

/**
 * Used when /api/public/config is unreachable (e.g. during `next build` or an API outage).
 * Lives in a plain module (not 'use client') so server components receive the real object.
 */
export const FALLBACK_CONFIG: SiteConfig = {
  contact: { phone: '+91 90000 00000', email: 'hello@royalride.in', whatsapp: '919000000000', address: 'Bhubaneswar, Odisha' },
  company: { name: 'Royal Ride', gstin: '' },
  booking: { advancePercent: 25, holdMinutes: 20, minLeadHours: 2 },
  cancellationTiers: [],
  gstPercent: 5,
  content: {},
};
