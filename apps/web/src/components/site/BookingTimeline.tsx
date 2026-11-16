import clsx from 'clsx';
import { Ban, Car, CheckCircle2, CircleDollarSign, ClipboardCheck, CreditCard, Flag, Navigation, RotateCcw, UserCheck, Wallet } from 'lucide-react';
import type { BookingStatus } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const MAIN: BookingStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'];
const CANCEL: BookingStatus[] = ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'];

const META: Record<BookingStatus, { label: string; desc: string; icon: typeof Car }> = {
  PENDING: { label: 'Booking placed', desc: 'We received your booking request.', icon: ClipboardCheck },
  AWAITING_PAYMENT: { label: 'Awaiting payment', desc: 'Vehicle held while you complete the advance payment.', icon: CreditCard },
  CONFIRMED: { label: 'Confirmed', desc: 'Payment received and your vehicle is reserved.', icon: CheckCircle2 },
  DRIVER_ASSIGNED: { label: 'Driver assigned', desc: 'Your chauffeur has been assigned.', icon: UserCheck },
  VEHICLE_DISPATCHED: { label: 'Vehicle dispatched', desc: 'The vehicle is on its way to your pickup point.', icon: Car },
  TRIP_STARTED: { label: 'Trip started', desc: 'Enjoy your journey!', icon: Navigation },
  TRIP_COMPLETED: { label: 'Trip completed', desc: 'Thank you for riding with Royal Ride.', icon: Flag },
  CANCELLED: { label: 'Cancelled', desc: 'This booking was cancelled.', icon: Ban },
  REFUND_INITIATED: { label: 'Refund initiated', desc: 'Your refund is being processed by the bank.', icon: RotateCcw },
  REFUNDED: { label: 'Refunded', desc: 'The refund has been credited to your account.', icon: Wallet },
};

export interface TimelineHistory {
  toStatus: BookingStatus;
  note: string | null;
  createdAt: string;
}

/** Vertical tracking timeline covering all 10 booking statuses. */
export function BookingTimeline({ status, history, createdAt, paidAmount }: { status: BookingStatus; history: TimelineHistory[]; createdAt: string; paidAmount: number }) {
  const at = new Map<BookingStatus, TimelineHistory>();
  for (const h of history) at.set(h.toStatus, h); // latest wins
  const cancelled = CANCEL.includes(status);

  let steps: BookingStatus[];
  let currentIdx: number;
  if (!cancelled) {
    steps = MAIN;
    currentIdx = Math.max(0, MAIN.indexOf(status));
  } else {
    const reached = MAIN.filter((s) => s === 'PENDING' || at.has(s));
    const refundSteps: BookingStatus[] = paidAmount > 0 || at.has('REFUND_INITIATED') || at.has('REFUNDED') ? ['REFUND_INITIATED', 'REFUNDED'] : [];
    steps = [...reached, 'CANCELLED', ...refundSteps];
    currentIdx = steps.indexOf(status);
  }

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const m = META[s];
        const Icon = m.icon;
        const done = i < currentIdx;
        const current = i === currentIdx;
        const isCancel = s === 'CANCELLED';
        const h = s === 'PENDING' ? { createdAt, note: null } : at.get(s);
        const last = i === steps.length - 1;
        return (
          <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={clsx('absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5', done ? (cancelled && i >= steps.indexOf('CANCELLED') ? 'bg-red-200' : 'bg-emerald-400') : 'bg-mist-200')} aria-hidden />}
            <span
              className={clsx(
                'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white transition',
                isCancel && (done || current) ? 'bg-red-500 text-white' : done ? 'bg-emerald-500 text-white' : current ? 'bg-gold-sheen text-navy-950 shadow-gold' : 'bg-mist-100 text-slate-400',
                current && !isCancel && 'animate-pulse',
              )}
            >
              {s === 'REFUNDED' && (done || current) ? <CircleDollarSign className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </span>
            <div className="min-w-0 pt-1.5">
              <p className={clsx('text-sm font-semibold', done || current ? 'text-navy-900' : 'text-slate-400')}>
                {m.label}
                {current && <span className="ml-2 rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Current</span>}
              </p>
              <p className={clsx('text-xs', done || current ? 'text-slate-600' : 'text-slate-400')}>{h?.note && s !== 'PENDING' ? h.note : m.desc}</p>
              {h && (done || current) && <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(h.createdAt)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

