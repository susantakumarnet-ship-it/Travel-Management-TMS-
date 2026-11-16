'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, ChevronRight, UserX } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, inr, PURPOSE_LABEL, TRIP_LABEL } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, StatusBadge, Tabs } from '@/components/ui/Display';
import type { OwnerBookingRow } from '@/components/partner/types';

type Scope = 'pending' | 'upcoming' | 'past' | 'all';
const TABS: { value: Scope; label: string }[] = [
  { value: 'pending', label: 'Pending decision' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

function BookingsList() {
  const params = useSearchParams();
  const router = useRouter();
  const t = params.get('tab') as Scope | null;
  const scope: Scope = t && TABS.some((x) => x.value === t) ? t : 'pending';
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<OwnerBookingRow>>('/owner/bookings', { query: { scope, page, pageSize: 20 } });

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Accept new requests, assign drivers and track every trip." />
      <Tabs
        tabs={TABS.map((x) => ({ ...x, count: x.value === scope ? data?.total : undefined }))}
        value={scope}
        onChange={(v) => {
          setPage(1);
          router.replace(`/owner/bookings?tab=${v}`, { scroll: false });
        }}
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={scope === 'pending' ? 'Nothing waiting for you' : 'No bookings here'}
          description={scope === 'pending' ? 'New booking requests that need your acceptance appear here.' : 'Bookings for your vehicles will be listed here.'}
          icon={<CalendarCheck className="h-6 w-6" />}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data?.items.map((b) => (
              <li key={b.id}>
                <Link href={`/owner/bookings/${b.id}`} className="card flex flex-col gap-3 p-4 transition hover:shadow-lift sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-center gap-3 sm:w-44 sm:flex-col sm:items-start sm:gap-1">
                    <p className="text-sm font-bold text-navy-900">{fmtDateTime(b.pickupAt)}</p>
                    <p className="font-mono text-xs text-slate-500">#{b.bookingNumber}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {b.vehicle.title} <span className="font-mono text-xs font-normal text-slate-500">{b.vehicle.registrationNumber}</span>
                    </p>
                    <p className="truncate text-sm text-slate-600">
                      {b.pickupAddress}
                      {b.dropAddress ? ` → ${b.dropAddress}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {PURPOSE_LABEL[b.purpose]} · {TRIP_LABEL[b.tripType]} · {b.customer.name ?? 'Customer'}
                      {b.withDriver && !b.driver && ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(b.status) && (
                        <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700">
                          <UserX className="h-3 w-3" /> Needs driver
                        </span>
                      )}
                      {b.driver && ` · Driver: ${b.driver.user.name ?? b.driver.user.phone}`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="flex flex-wrap gap-1.5">
                      {b.ownerDecision === 'PENDING' && !['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'].includes(b.status) && <Badge tone="gold">Decision needed</Badge>}
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-sm">
                      <span className="text-slate-500">Payout </span>
                      <span className="font-bold text-emerald-700">{inr(b.ownerPayout)}</span>
                    </p>
                  </div>
                  <ChevronRight className="hidden h-5 w-5 text-slate-300 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
        </>
      )}
    </div>
  );
}

export default function OwnerBookingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BookingsList />
    </Suspense>
  );
}
