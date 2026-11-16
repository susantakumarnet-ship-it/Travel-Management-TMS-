import type { BookingStatus, TravelPurpose, TripType } from './types';

export function inr(n: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const v = Number(n ?? 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: opts.decimals ? 2 : 0, maximumFractionDigits: opts.decimals || v % 1 ? 2 : 0 });
}

const TZ = 'Asia/Kolkata';
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '—';

/** Value for <input type="datetime-local"> from a Date, in IST. */
export function toLocalInput(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}
/** Parse a datetime-local value (interpreted as IST) to ISO string. */
export function fromLocalInput(v: string) {
  return new Date(`${v}:00+05:30`).toISOString();
}
/** Combine separate date (YYYY-MM-DD) and time (HH:mm) inputs, interpreted as IST. */
export function combineIst(date: string, time: string) {
  return new Date(`${date}T${time || '00:00'}:00+05:30`).toISOString();
}
export function istToday(offsetDays = 0) {
  return new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  AWAITING_PAYMENT: 'Awaiting Payment',
  CONFIRMED: 'Confirmed',
  DRIVER_ASSIGNED: 'Driver Assigned',
  VEHICLE_DISPATCHED: 'Vehicle Dispatched',
  TRIP_STARTED: 'Trip Started',
  TRIP_COMPLETED: 'Trip Completed',
  CANCELLED: 'Cancelled',
  REFUND_INITIATED: 'Refund Initiated',
  REFUNDED: 'Refunded',
};

export const STATUS_TONE: Record<BookingStatus, 'gray' | 'amber' | 'blue' | 'indigo' | 'violet' | 'green' | 'red' | 'gold'> = {
  PENDING: 'gray',
  AWAITING_PAYMENT: 'amber',
  CONFIRMED: 'blue',
  DRIVER_ASSIGNED: 'indigo',
  VEHICLE_DISPATCHED: 'violet',
  TRIP_STARTED: 'gold',
  TRIP_COMPLETED: 'green',
  CANCELLED: 'red',
  REFUND_INITIATED: 'amber',
  REFUNDED: 'gray',
};

export const PURPOSE_LABEL: Record<TravelPurpose, string> = {
  WEDDING: 'Wedding',
  FAMILY_TRIP: 'Family trip',
  BUSINESS: 'Business',
  AIRPORT_TRANSFER: 'Airport transfer',
  LOCAL_TRAVEL: 'Local travel',
  OUTSTATION: 'Outstation travel',
  OTHER: 'Other',
};

export const TRIP_LABEL: Record<TripType, string> = {
  LOCAL_HOURLY: 'Local (hourly)',
  OUTSTATION: 'Outstation (per km)',
  AIRPORT_TRANSFER: 'Airport transfer',
  MULTI_DAY: 'Daily rental',
  SELF_DRIVE: 'Self drive',
};

export const FUEL_LABEL: Record<string, string> = { PETROL: 'Petrol', DIESEL: 'Diesel', CNG: 'CNG', ELECTRIC: 'Electric', HYBRID: 'Hybrid' };

export function titleCase(s: string) {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function whatsappLink(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
