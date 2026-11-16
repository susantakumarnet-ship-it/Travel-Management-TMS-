'use client';

import { Suspense } from 'react';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { fmtDate, inr, titleCase } from '@/lib/format';
import { PageHeader } from '@/components/ui/Display';
import { Checkbox } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Chips, FilterBar } from '@/components/admin/FilterBar';
import { useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { WEDDING_STATUSES, WEDDING_STATUS_TONE, daysUntil } from '@/components/admin/utils';

interface WeddingRow {
  id: string;
  requestNumber: string;
  weddingDate: string;
  venueName: string;
  venueAddress: string;
  totalVehicles: number;
  status: string;
  quotedAmount: number | null;
  customer: { name: string | null; phone: string };
  package: { name: string } | null;
  _count: { bookings: number };
}

function WeddingsInner() {
  const { values, page, set, setPage, reset } = useUrlFilters({ status: '', upcoming: '' });
  const { data, loading, error, reload } = useApi<Paged<WeddingRow>>('/admin/weddings', {
    query: { page, pageSize: 20, status: values.status, upcoming: values.upcoming === 'true' ? 'true' : undefined },
  });

  const columns: Column<WeddingRow>[] = [
    { key: 'no', header: 'Request', render: (w) => <Cell primary={w.requestNumber} href={`/admin/weddings/${w.id}`} /> },
    { key: 'cust', header: 'Customer', render: (w) => <Cell primary={w.customer.name ?? '—'} secondary={w.customer.phone} /> },
    {
      key: 'date',
      header: 'Wedding date',
      render: (w) => {
        const d = daysUntil(w.weddingDate);
        return (
          <div className="whitespace-nowrap">
            <div className="font-medium text-navy-900">{fmtDate(w.weddingDate)}</div>
            {d != null && d >= 0 && <div className={d <= 7 ? 'text-xs font-semibold text-amber-700' : 'text-xs text-slate-500'}>{d === 0 ? 'Today' : `in ${d} days`}</div>}
          </div>
        );
      },
    },
    { key: 'venue', header: 'Venue', render: (w) => <Cell primary={w.venueName} secondary={w.venueAddress} /> },
    { key: 'veh', header: 'Vehicles', align: 'center', render: (w) => w.totalVehicles },
    { key: 'pkg', header: 'Package', render: (w) => w.package?.name ?? <span className="text-slate-400">Custom</span> },
    { key: 'quote', header: 'Quoted', align: 'right', render: (w) => (w.quotedAmount != null ? <span className="tabular-nums">{inr(Number(w.quotedAmount))}</span> : <span className="text-slate-400">—</span>) },
    { key: 'status', header: 'Status', render: (w) => <EnumBadge value={w.status} tones={WEDDING_STATUS_TONE} /> },
    { key: 'bk', header: 'Bookings', align: 'center', render: (w) => w._count.bookings },
  ];

  return (
    <div>
      <PageHeader title="Wedding bookings" subtitle="Wedding transport requests, quotes and linked vehicle bookings" />
      <Chips<string> value={values.status} onChange={(v) => set({ status: v })} options={[{ value: '', label: 'All' }, ...WEDDING_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
      <FilterBar onReset={reset}>
        <div className="flex h-10 items-center rounded-lg border border-mist-300 bg-white px-3">
          <Checkbox label="Upcoming only" checked={values.upcoming === 'true'} onChange={(v) => set({ upcoming: v ? 'true' : '' })} />
        </div>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(w) => w.id}
        rowHref={(w) => `/admin/weddings/${w.id}`}
        empty="No wedding requests"
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
      />
    </div>
  );
}

export default function WeddingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WeddingsInner />
    </Suspense>
  );
}
