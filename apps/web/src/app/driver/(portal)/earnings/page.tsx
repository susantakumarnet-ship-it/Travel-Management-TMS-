'use client';

import Link from 'next/link';
import { IndianRupee, Route } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';

interface Earnings {
  total: number;
  trips: number;
  rows: {
    id: string;
    bookingId: string;
    driverEarning: number;
    assignedAt: string;
    booking: { bookingNumber: string; completedAt: string | null; pickupAt: string; returnAt: string; pickupAddress: string; dropAddress: string | null; vehicle: { title: string } };
  }[];
}

export default function DriverEarningsPage() {
  const { data, error, loading, reload } = useApi<Earnings>('/driver/earnings');
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = data?.rows.filter((r) => (r.booking.completedAt ?? r.assignedAt).slice(0, 7) === monthKey).reduce((a, r) => a + Number(r.driverEarning), 0) ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Earnings" subtitle="Your share for completed trips." />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : data ? (
        <>
          <div className="mb-6 rounded-3xl bg-navy-deep p-6 text-white shadow-lift">
            <p className="text-sm font-semibold uppercase tracking-wide text-gold-300">Total earned</p>
            <p className="mt-1 font-display text-4xl font-semibold">{inr(data.total)}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-navy-100">Completed trips</p>
                <p className="text-lg font-bold">{data.trips}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-navy-100">This month</p>
                <p className="text-lg font-bold">{inr(thisMonth)}</p>
              </div>
            </div>
          </div>
          {data.rows.length === 0 ? (
            <EmptyState title="No earnings yet" description="Complete trips to start earning." icon={<IndianRupee className="h-6 w-6" />} />
          ) : (
            <ul className="space-y-3">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/driver/trips/${r.bookingId}`} className="card flex items-center gap-3 p-4 active:bg-mist-50">
                    <div className="rounded-xl bg-gold-50 p-2.5 text-gold-700">
                      <Route className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-900">
                        {fmtDate(r.booking.completedAt ?? r.booking.pickupAt)} · <span className="font-mono text-xs">#{r.booking.bookingNumber}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.booking.vehicle.title} · {r.booking.pickupAddress}
                        {r.booking.dropAddress ? ` → ${r.booking.dropAddress}` : ''}
                      </p>
                    </div>
                    <p className="text-base font-bold text-emerald-700">{inr(r.driverEarning)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
