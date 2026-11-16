'use client';

import clsx from 'clsx';
import { useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import { istToday } from '@/lib/format';
import { Skeleton, ErrorState } from '@/components/ui/Display';
import type { CalendarBlock } from './siteTypes';

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

export const PICK_DATE_EVENT = 'rr:pick-date';

/** Next 30 days (IST); free days are clickable and broadcast PICK_DATE_EVENT for the price calculator. */
export function AvailabilityCalendar({ vehicleId }: { vehicleId: string }) {
  const onPick = (date: string) => {
    window.dispatchEvent(new CustomEvent(PICK_DATE_EVENT, { detail: date }));
    document.getElementById('price-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const from = useMemo(() => new Date(`${istToday()}T00:00:00+05:30`), []);
  const to = useMemo(() => new Date(from.getTime() + 30 * DAY_MS), [from]);
  const { data, loading, error, reload } = useApi<CalendarBlock[]>(`/public/vehicles/${vehicleId}/calendar`, { query: { from: from.toISOString(), to: to.toISOString() } });

  const days = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const start = from.getTime() + i * DAY_MS;
      const end = start + DAY_MS;
      const blocks = (data ?? []).filter((b) => new Date(b.start).getTime() < end && new Date(b.end).getTime() > start);
      const status: 'free' | 'booked' | 'unavailable' = blocks.some((b) => b.type === 'booked') ? 'booked' : blocks.length ? 'unavailable' : 'free';
      const wall = new Date(start + IST_MS);
      return { key: wall.toISOString().slice(0, 10), day: wall.getUTCDate(), dow: wall.getUTCDay(), month: wall.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }), status };
    });
  }, [data, from]);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const lead = days[0]?.dow ?? 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase text-slate-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={d.status !== 'free'}
            onClick={() => onPick(d.key)}
            title={d.status === 'free' ? 'Available — click to select as pickup date' : d.status === 'booked' ? 'Booked' : 'Unavailable'}
            className={clsx(
              'flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition',
              d.status === 'free' && 'bg-emerald-50 text-emerald-800 enabled:hover:bg-emerald-100',
              d.status === 'booked' && 'bg-red-50 text-red-400 line-through',
              d.status === 'unavailable' && 'bg-mist-200 text-slate-400 line-through',
            )}
            aria-label={`${d.day} ${d.month}: ${d.status === 'free' ? 'available' : d.status}`}
          >
            {d.day}
            {d.day === 1 && <span className="text-[9px] font-medium uppercase">{d.month}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <Legend cls="bg-emerald-100" label="Available" />
        <Legend cls="bg-red-100" label="Booked" />
        <Legend cls="bg-mist-300" label="Unavailable" />
      </div>
      <p className="mt-1 text-xs text-slate-400">Partially booked days may still have free slots — use the price calculator to check exact times.</p>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('h-3 w-3 rounded', cls)} /> {label}
    </span>
  );
}
