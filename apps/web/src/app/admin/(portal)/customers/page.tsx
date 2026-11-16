'use client';

import { Suspense } from 'react';
import type { Paged } from '@/lib/types';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/format';
import { PageHeader } from '@/components/ui/Display';
import { DataTable } from '@/components/admin/DataTable';
import { Chips, FilterBar, SearchInput } from '@/components/admin/FilterBar';
import { useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { USER_STATUS_TONE } from '@/components/admin/utils';

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  totalPaid: number;
  _count: { bookings: number };
}

function CustomersInner() {
  const { values, page, set, setPage, reset } = useUrlFilters({ q: '', status: '' });
  const { data, loading, error, reload } = useApi<Paged<CustomerRow>>('/admin/customers', { query: { ...values, page, pageSize: 20 } });
  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone who has signed up to book with Royal Ride" />
      <Chips
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[
          { value: '', label: 'All' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'PENDING', label: 'Pending' },
        ]}
      />
      <FilterBar search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Name, phone or email" />} onReset={values.q || values.status ? reset : undefined} />
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/customers/${r.id}`}
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
        empty="No customers found"
        columns={[
          { key: 'name', header: 'Customer', render: (r) => <Cell primary={r.name || 'Unnamed'} secondary={r.phone} href={`/admin/customers/${r.id}`} /> },
          { key: 'email', header: 'Email', render: (r) => r.email ?? <span className="text-slate-400">—</span> },
          { key: 'bookings', header: 'Bookings', align: 'right', render: (r) => r._count.bookings },
          { key: 'paid', header: 'Total paid', align: 'right', render: (r) => inr(Number(r.totalPaid)) },
          { key: 'status', header: 'Status', render: (r) => <EnumBadge value={r.status} tones={USER_STATUS_TONE} /> },
          { key: 'joined', header: 'Joined', render: (r) => fmtDate(r.createdAt) },
          { key: 'last', header: 'Last login', render: (r) => fmtDate(r.lastLoginAt) },
        ]}
      />
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomersInner />
    </Suspense>
  );
}
