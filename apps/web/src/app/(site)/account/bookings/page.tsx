'use client';

import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { EmptyState, ErrorState, Pagination, Skeleton, Tabs } from '@/components/ui/Display';
import { ButtonLink } from '@/components/ui/Button';
import { BookingCard } from '@/components/site/BookingCard';
import type { BookingListItem } from '@/components/site/siteTypes';

type Scope = 'upcoming' | 'past' | 'all';

export default function BookingsPage() {
  const [scope, setScope] = useState<Scope>('upcoming');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<BookingListItem>>('/customer/bookings', { query: { scope, page, pageSize: 10 } });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">My bookings</h1>
      <Tabs<Scope>
        value={scope}
        onChange={(v) => {
          setScope(v);
          setPage(1);
        }}
        tabs={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past & cancelled' },
          { value: 'all', label: 'All' },
        ]}
      />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyState
          title={scope === 'upcoming' ? 'No upcoming trips' : 'No bookings yet'}
          description="When you book a vehicle, you can track it here."
          action={<ButtonLink href="/vehicles" variant="gold">Find a vehicle</ButtonLink>}
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
