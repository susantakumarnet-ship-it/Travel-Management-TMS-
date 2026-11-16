'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { CircleDollarSign, ListChecks } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { combineIst, fmtDateTime, inr, titleCase } from '@/lib/format';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { PAYMENT_STATUS_TONE, REFUND_STATUS_TONE } from '@/components/admin/utils';

interface PaymentRow {
  id: string;
  gateway: string;
  purpose: string;
  amount: number;
  status: string;
  method: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  failureReason: string | null;
  capturedAt: string | null;
  createdAt: string;
  booking: { id: string; bookingNumber: string };
  user: { name: string | null; phone: string };
  refunds: { amount: number; status: string }[];
}

const GATEWAYS = ['RAZORPAY', 'CASHFREE', 'PHONEPE', 'CASH', 'BANK_TRANSFER', 'TEST'];
const STATUSES = ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED'];

function PaymentsInner() {
  const { values, page, set, setPage, reset } = useUrlFilters({ status: '', gateway: '', q: '', from: '', to: '' });
  const { data, loading, error, reload } = useApi<Paged<PaymentRow> & { capturedTotal: number }>('/admin/payments', {
    query: {
      page,
      pageSize: 25,
      status: values.status,
      gateway: values.gateway,
      q: values.q,
      from: values.from ? combineIst(values.from, '00:00') : undefined,
      to: values.to ? combineIst(values.to, '23:59') : undefined,
    },
  });

  const columns: Column<PaymentRow>[] = [
    { key: 'date', header: 'Date', render: (p) => <span className="whitespace-nowrap">{fmtDateTime(p.capturedAt ?? p.createdAt)}</span> },
    {
      key: 'bk',
      header: 'Booking',
      render: (p) => (
        <Link href={`/admin/bookings/${p.booking.id}`} className="font-medium text-navy-700 hover:underline">
          {p.booking.bookingNumber}
        </Link>
      ),
    },
    { key: 'cust', header: 'Customer', render: (p) => <Cell primary={p.user.name ?? '—'} secondary={p.user.phone} /> },
    { key: 'gw', header: 'Gateway', render: (p) => <Cell primary={titleCase(p.gateway)} secondary={p.method ?? undefined} /> },
    { key: 'purpose', header: 'Purpose', render: (p) => titleCase(p.purpose) },
    { key: 'amt', header: 'Amount', align: 'right', render: (p) => <span className="font-semibold tabular-nums text-navy-900">{inr(Number(p.amount))}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <div>
          <EnumBadge value={p.status} tones={PAYMENT_STATUS_TONE} />
          {p.failureReason && <div className="mt-0.5 max-w-[180px] truncate text-xs text-red-600" title={p.failureReason}>{p.failureReason}</div>}
        </div>
      ),
    },
    {
      key: 'ref',
      header: 'Refunds',
      render: (p) =>
        p.refunds.length ? (
          <div className="space-y-0.5">
            {p.refunds.map((r, i) => (
              <div key={i} className="flex items-center gap-1 whitespace-nowrap text-xs">
                {inr(Number(r.amount))} <EnumBadge value={r.status} tones={REFUND_STATUS_TONE} />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'ids',
      header: 'Gateway IDs',
      render: (p) => (
        <div className="max-w-[200px] text-xs text-slate-500">
          {p.gatewayPaymentId && <div className="truncate" title={p.gatewayPaymentId}>pay: {p.gatewayPaymentId}</div>}
          {p.gatewayOrderId && <div className="truncate" title={p.gatewayOrderId}>order: {p.gatewayOrderId}</div>}
          {!p.gatewayPaymentId && !p.gatewayOrderId && '—'}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Payments" subtitle="Online and offline payment transactions" />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Captured (filtered)" value={data ? inr(Number(data.capturedTotal)) : '—'} icon={<CircleDollarSign className="h-5 w-5" />} tone="green" hint="Sum of captured payments matching the filters" />
        <StatCard label="Transactions" value={data?.total ?? '—'} icon={<ListChecks className="h-5 w-5" />} />
      </div>
      <FilterBar search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Booking #, payment or order ID" />} onReset={reset}>
        <FilterSelect value={values.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
        <FilterSelect value={values.gateway} onChange={(v) => set({ gateway: v })} placeholder="All gateways" options={GATEWAYS.map((s) => ({ value: s, label: titleCase(s) }))} />
        <input type="date" className="input h-10 w-full py-0 md:w-auto" value={values.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
        <input type="date" className="input h-10 w-full py-0 md:w-auto" value={values.to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(p) => p.id}
        empty="No payments found"
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
      />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PaymentsInner />
    </Suspense>
  );
}
