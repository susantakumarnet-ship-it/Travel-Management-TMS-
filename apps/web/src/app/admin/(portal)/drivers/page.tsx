'use client';

import { Suspense } from 'react';
import { Star } from 'lucide-react';
import type { Paged } from '@/lib/types';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/format';
import { PageHeader } from '@/components/ui/Display';
import { DataTable } from '@/components/admin/DataTable';
import { Chips, FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { USER_STATUS_TONE, VERIFICATION_TONE, daysUntil } from '@/components/admin/utils';

interface DriverRow {
  id: string;
  licenceNumber: string;
  licenceExpiry: string;
  experienceYears: number;
  verificationStatus: string;
  isAvailable: boolean;
  ratingAvg: number;
  ratingCount: number;
  dailyWage: number;
  user: { name: string | null; phone: string; status: string };
  owner: { businessName: string } | null;
  city: { name: string } | null;
  _count: { bookings: number };
}

function DriversInner() {
  const { values, page, set, setPage, reset } = useUrlFilters({ q: '', status: '', ownerId: '' });
  const { data, loading, error, reload } = useApi<Paged<DriverRow>>('/admin/drivers', { query: { ...values, page, pageSize: 20 } });
  const owners = useApi<Paged<{ id: string; businessName: string }>>('/admin/owners', { query: { pageSize: 100 } });
  return (
    <>
      <PageHeader title="Drivers" subtitle="Verification, wages, fleet links and trip history" />
      <Chips
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[
          { value: '', label: 'All' },
          { value: 'PENDING', label: 'Pending verification' },
          { value: 'APPROVED', label: 'Verified' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
      />
      <FilterBar search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Name, phone or licence no." />} onReset={Object.values(values).some(Boolean) ? reset : undefined}>
        <FilterSelect value={values.ownerId} onChange={(v) => set({ ownerId: v })} placeholder="All owners" options={(owners.data?.items ?? []).map((o) => ({ value: o.id, label: o.businessName }))} />
      </FilterBar>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/drivers/${r.id}`}
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
        empty="No drivers found"
        columns={[
          { key: 'n', header: 'Driver', render: (r) => <Cell primary={r.user.name ?? 'Unnamed'} secondary={r.user.phone} href={`/admin/drivers/${r.id}`} /> },
          {
            key: 'l',
            header: 'Licence',
            render: (r) => {
              const d = daysUntil(r.licenceExpiry) ?? 999;
              return <Cell primary={<span className="font-mono text-xs">{r.licenceNumber}</span>} secondary={<span className={d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-700' : ''}>Exp. {fmtDate(r.licenceExpiry)}</span>} />;
            },
          },
          { key: 'o', header: 'Owner', render: (r) => r.owner?.businessName ?? <span className="text-slate-400">Independent</span> },
          { key: 'c', header: 'City', render: (r) => r.city?.name ?? '—' },
          { key: 'x', header: 'Exp.', align: 'right', render: (r) => `${r.experienceYears}y` },
          { key: 't', header: 'Trips', align: 'right', render: (r) => r._count.bookings },
          {
            key: 'r',
            header: 'Rating',
            align: 'right',
            render: (r) =>
              r.ratingCount ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />
                  {Number(r.ratingAvg).toFixed(1)}
                </span>
              ) : (
                '—'
              ),
          },
          { key: 'w', header: 'Wage/day', align: 'right', render: (r) => inr(Number(r.dailyWage)) },
          { key: 'v', header: 'Verification', render: (r) => <EnumBadge value={r.verificationStatus} tones={VERIFICATION_TONE} /> },
          { key: 'u', header: 'Account', render: (r) => <EnumBadge value={r.user.status} tones={USER_STATUS_TONE} /> },
        ]}
      />
    </>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DriversInner />
    </Suspense>
  );
}
