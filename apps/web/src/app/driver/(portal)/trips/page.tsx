'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Route } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/Display';
import { TripCard } from '@/components/partner/TripCard';
import type { DriverTrip } from '@/components/partner/types';

type Scope = 'upcoming' | 'history';

function TripsList() {
  const params = useSearchParams();
  const router = useRouter();
  const scope: Scope = params.get('tab') === 'history' ? 'history' : 'upcoming';
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<DriverTrip>>('/driver/trips', { query: { scope, page, pageSize: 20 } });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My trips" />
      <Tabs
        tabs={[
          { value: 'upcoming' as Scope, label: 'Upcoming' },
          { value: 'history' as Scope, label: 'History' },
        ]}
        value={scope}
        onChange={(v) => {
          setPage(1);
          router.replace(`/driver/trips?tab=${v}`, { scroll: false });
        }}
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState title={scope === 'upcoming' ? 'No upcoming trips' : 'No past trips yet'} icon={<Route className="h-6 w-6" />} />
      ) : (
        <>
          <div className="space-y-3">
            {data?.items.map((t) => (
              <TripCard key={t.id} t={t} highlight={t.status === 'TRIP_STARTED'} />
            ))}
          </div>
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
        </>
      )}
    </div>
  );
}

export default function DriverTripsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TripsList />
    </Suspense>
  );
}
