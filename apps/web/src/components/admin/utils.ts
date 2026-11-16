'use client';

import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api';
import type { Tone } from '@/components/ui/Display';

/** Resolve a stored media key (e.g. "public/content/2026-11/x.jpg") to a browser URL. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^(https?:)?\/\//.test(key) || key.startsWith('/') || key.startsWith('data:') || key.startsWith('blob:')) return key;
  return `/uploads/${key}`;
}

/** Show an error toast and return field errors (if any) for inline display. */
export function reportError(e: unknown, fallback?: string): Record<string, string> {
  const fe = e instanceof ApiError ? e.fieldErrors : {};
  const hasFields = Object.keys(fe).length > 0;
  toast.error(hasFields ? 'Please fix the highlighted fields' : errorMessage(e) || fallback || 'Something went wrong');
  return fe;
}

/** Convert '' → undefined / null and numeric strings → numbers. */
export const numOrNull = (v: string | number | null | undefined) => (v === '' || v == null ? null : Number(v));
export const strOrNull = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());

/** YYYY-MM-DD from an ISO date (date-only columns are stored at UTC midnight). */
export const dateInput = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');

export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export const VERIFICATION_TONE: Record<string, Tone> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', VERIFIED: 'green' };
export const VEHICLE_STATUS_TONE: Record<string, Tone> = { PENDING_APPROVAL: 'amber', ACTIVE: 'green', INACTIVE: 'gray', MAINTENANCE: 'violet', REJECTED: 'red' };
export const USER_STATUS_TONE: Record<string, Tone> = { ACTIVE: 'green', PENDING: 'amber', SUSPENDED: 'red' };
export const WEDDING_STATUS_TONE: Record<string, Tone> = { ENQUIRY: 'amber', QUOTED: 'blue', ACCEPTED: 'indigo', CONFIRMED: 'green', COMPLETED: 'gray', CANCELLED: 'red' };
export const PAYMENT_STATUS_TONE: Record<string, Tone> = { CREATED: 'gray', AUTHORIZED: 'blue', CAPTURED: 'green', FAILED: 'red' };
export const REFUND_STATUS_TONE: Record<string, Tone> = { INITIATED: 'amber', PROCESSED: 'green', FAILED: 'red' };
export const SETTLEMENT_TONE: Record<string, Tone> = { PENDING: 'amber', PROCESSING: 'blue', PAID: 'green' };
export const NOTIF_STATUS_TONE: Record<string, Tone> = { QUEUED: 'amber', SENT: 'green', FAILED: 'red' };
export const ENQUIRY_TONE: Record<string, Tone> = { NEW: 'amber', IN_PROGRESS: 'blue', CLOSED: 'gray' };

export const VEHICLE_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'REJECTED'] as const;
export const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'] as const;
export const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'] as const;
export const PURPOSES = ['WEDDING', 'FAMILY_TRIP', 'BUSINESS', 'AIRPORT_TRANSFER', 'LOCAL_TRAVEL', 'OUTSTATION', 'OTHER'] as const;
export const BOOKING_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'CANCELLED', 'REFUND_INITIATED', 'REFUNDED'] as const;
export const WEDDING_STATUSES = ['ENQUIRY', 'QUOTED', 'ACCEPTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
export const DOC_TYPE_LABEL: Record<string, string> = {
  RC: 'Registration certificate',
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate',
  PERMIT: 'Permit',
  PUC: 'Pollution (PUC)',
  DRIVING_LICENCE: 'Driving licence',
  AADHAAR: 'Aadhaar',
  PAN: 'PAN',
  POLICE_VERIFICATION: 'Police verification',
  BANK_PROOF: 'Bank proof',
  OTHER: 'Other',
};

/** Chart palette (validated: adjacent CVD ΔE ≥ 8, normal-vision ≥ 15). Navy-blue / gold lead for the brand. */
export const SERIES = ['#2a5bd7', '#c9a227', '#1baf7a', '#6250d6', '#e34948'] as const;
export const CHART_INK = { grid: '#e4e7ec', axis: '#64748b', text: '#0b1f4b' };

export function compactInr(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `₹${Math.round(n)}`;
}
