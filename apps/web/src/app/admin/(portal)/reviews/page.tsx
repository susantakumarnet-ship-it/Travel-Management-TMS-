'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Chips, FilterBar, FilterSelect } from '@/components/admin/FilterBar';
import { Cell, PageSkeleton } from '@/components/admin/bits';
import { usePerm, useUrlFilters } from '@/components/admin/hooks';
import { reportError } from '@/components/admin/utils';

interface Review {
  id: string;
  rating: number;
  vehicleRating: number | null;
  driverRating: number | null;
  comment: string | null;
  status: 'PUBLISHED' | 'HIDDEN';
  ownerReply: string | null;
  createdAt: string;
  customer: { name: string | null; phone: string };
  vehicle: { title: string };
  booking: { bookingNumber: string };
  bookingId: string;
  driver: { user: { name: string | null } } | null;
}

function Stars({ n, small }: { n: number | null; small?: boolean }) {
  if (n == null) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${small ? 'h-3 w-3' : 'h-4 w-4'} ${i <= n ? 'fill-gold-500 text-gold-500' : 'text-mist-300'}`} />
      ))}
    </span>
  );
}

function ReviewsInner() {
  const { canWrite } = usePerm('reviews');
  const f = useUrlFilters({ status: '', maxRating: '' });
  const { data, loading, error, reload, setData } = useApi<Paged<Review>>('/admin/reviews', { query: { ...f.values, page: f.page } });
  const [busy, setBusy] = useState<string | null>(null);

  async function moderate(r: Review, status: Review['status']) {
    setBusy(r.id);
    try {
      await api(`/admin/reviews/${r.id}`, { method: 'PATCH', body: { status } });
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === r.id ? { ...x, status } : x)) } : d));
      toast.success(status === 'PUBLISHED' ? 'Review published' : 'Review hidden');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  }

  const cols: Column<Review>[] = [
    { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.createdAt)}</span> },
    {
      key: 'rating',
      header: 'Rating',
      render: (r) => (
        <div className="space-y-0.5">
          <Stars n={r.rating} />
          <div className="flex gap-3 text-[11px] text-slate-500">
            {r.vehicleRating != null && <span>Vehicle {r.vehicleRating}/5</span>}
            {r.driverRating != null && <span>Driver {r.driverRating}/5</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'Comment',
      className: 'min-w-[260px] max-w-md',
      render: (r) => (
        <div>
          <p className="whitespace-pre-line text-sm text-slate-700">{r.comment || <span className="italic text-slate-400">No comment</span>}</p>
          {r.ownerReply && <p className="mt-1 border-l-2 border-gold-300 pl-2 text-xs text-slate-500">Owner: {r.ownerReply}</p>}
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (r) => <Cell primary={r.customer.name ?? 'Customer'} secondary={r.customer.phone} /> },
    { key: 'vehicle', header: 'Vehicle / driver', render: (r) => <Cell primary={r.vehicle.title} secondary={r.driver?.user.name ? `Driver: ${r.driver.user.name}` : undefined} /> },
    {
      key: 'booking',
      header: 'Booking',
      render: (r) => (
        <Link href={`/admin/bookings/${r.bookingId}`} className="font-mono text-xs font-semibold text-navy-700 hover:underline">
          {r.booking.bookingNumber}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'PUBLISHED' ? 'green' : 'gray'}>{r.status === 'PUBLISHED' ? 'Published' : 'Hidden'}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canWrite &&
        (r.status === 'PUBLISHED' ? (
          <Button size="sm" variant="outline" icon={<EyeOff className="h-4 w-4" />} loading={busy === r.id} onClick={() => moderate(r, 'HIDDEN')}>
            Hide
          </Button>
        ) : (
          <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} loading={busy === r.id} onClick={() => moderate(r, 'PUBLISHED')}>
            Publish
          </Button>
        )),
    },
  ];

  return (
    <>
      <PageHeader title="Reviews & ratings" subtitle="Moderate customer reviews. Hidden reviews are excluded from vehicle ratings." />
      <Chips
        value={f.values.status as '' | 'PUBLISHED' | 'HIDDEN'}
        onChange={(v) => f.set({ status: v })}
        options={[
          { value: '', label: 'All' },
          { value: 'PUBLISHED', label: 'Published' },
          { value: 'HIDDEN', label: 'Hidden' },
        ]}
      />
      <FilterBar onReset={f.reset}>
        <FilterSelect
          value={f.values.maxRating}
          onChange={(v) => f.set({ maxRating: v })}
          placeholder="Any rating"
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? 's' : ''} or less` }))}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty="No reviews match"
        page={data?.page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={f.setPage}
      />
    </>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewsInner />
    </Suspense>
  );
}
