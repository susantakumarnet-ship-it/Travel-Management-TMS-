'use client';

import { Suspense } from 'react';
import { useApi } from '@/lib/hooks';
import type { BookingStatus, Paged, TravelPurpose } from '@/lib/types';
import { PURPOSE_LABEL, STATUS_LABEL, combineIst, fmtDateTime, inr } from '@/lib/format';
import { PageHeader, StatusBadge } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Chips, FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { useUrlFilters } from '@/components/admin/hooks';
import { Cell, PageSkeleton } from '@/components/admin/bits';
import { BOOKING_STATUSES, PURPOSES } from '@/components/admin/utils';

interface BookingRow {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  purpose: TravelPurpose;
  pickupAt: string;
  returnAt: string;
  totalAmount: number;
  paidAmount: number;
  finalAmount: number | null;
  customer: { name: string | null; phone: string };
  vehicle: { title: string; registrationNumber: string };
  owner: { businessName: string };
  driver: { user: { name: string | null } } | null;
}

function BookingsInner() {
  const { values, page, set, setPage, reset } = useUrlFilters({ status: '', purpose: '', q: '', from: '', to: '', sort: 'created' });
  const { data, loading, error, reload } = useApi<Paged<BookingRow>>('/admin/bookings', {
    query: {
      page,
      pageSize: 20,
      status: values.status,
      purpose: values.purpose,
      q: values.q,
      from: values.from ? combineIst(values.from, '00:00') : undefined,
      to: values.to ? combineIst(values.to, '23:59') : undefined,
      sort: values.sort,
    },
  });

  const columns: Column<BookingRow>[] = [
    { key: 'no', header: 'Booking', render: (b) => <Cell primary={b.bookingNumber} secondary={PURPOSE_LABEL[b.purpose]} href={`/admin/bookings/${b.id}`} /> },
    { key: 'cust', header: 'Customer', render: (b) => <Cell primary={b.customer.name ?? '—'} secondary={b.customer.phone} /> },
    { key: 'veh', header: 'Vehicle', render: (b) => <Cell primary={b.vehicle.title} secondary={b.vehicle.registrationNumber} /> },
    { key: 'owner', header: 'Owner', render: (b) => <span className="text-slate-700">{b.owner.businessName}</span> },
    { key: 'driver', header: 'Driver', render: (b) => (b.driver ? b.driver.user.name ?? '—' : <span className="text-slate-400">Unassigned</span>) },
    { key: 'pickup', header: 'Pickup', render: (b) => <span className="whitespace-nowrap">{fmtDateTime(b.pickupAt)}</span> },
    {
      key: 'amt',
      header: 'Amount',
      align: 'right',
      render: (b) => (
        <div className="whitespace-nowrap tabular-nums">
          <div className="font-semibold text-navy-900">{inr(Number(b.finalAmount ?? b.totalAmount))}</div>
          <div className="text-xs text-slate-500">Paid {inr(Number(b.paidAmount))}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Bookings" subtitle="All vehicle bookings across the marketplace" />
      <Chips<string>
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[{ value: '', label: 'All' }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
      />
      <FilterBar
        search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Booking #, phone, name, reg no" />}
        onReset={reset}
      >
        <FilterSelect value={values.purpose} onChange={(v) => set({ purpose: v })} placeholder="All purposes" options={PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))} />
        <input type="date" className="input h-10 w-full py-0 md:w-auto" value={values.from} onChange={(e) => set({ from: e.target.value })} aria-label="Pickup from" title="Pickup from" />
        <input type="date" className="input h-10 w-full py-0 md:w-auto" value={values.to} onChange={(e) => set({ to: e.target.value })} aria-label="Pickup to" title="Pickup to" />
        <FilterSelect
          value={values.sort === 'created' ? '' : values.sort}
          onChange={(v) => set({ sort: v || 'created' })}
          placeholder="Newest first"
          options={[{ value: 'pickup', label: 'By pickup time' }]}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(b) => b.id}
        rowHref={(b) => `/admin/bookings/${b.id}`}
        empty="No bookings found"
        emptyDescription="Try changing the filters."
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
      />
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingsInner />
    </Suspense>
  );
}
