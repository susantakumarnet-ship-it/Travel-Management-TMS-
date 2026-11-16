'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, IndianRupee, Percent, Receipt, Route, Wallet } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr, istToday, titleCase } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

interface Earnings {
  summary: { trips: number; gross: number; gst: number; commission: number; payout: number };
  rows: {
    id: string;
    bookingNumber: string;
    completedAt: string;
    finalAmount: number;
    taxAmount: number;
    commissionRate: number;
    commissionAmount: number;
    ownerPayout: number;
    settlementId: string | null;
    vehicle: { title: string; registrationNumber: string };
  }[];
}
interface Settlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  commissionAmount: number;
  adjustments: number;
  netAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID';
  referenceNumber: string | null;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
  _count: { bookings: number };
}

const SETTLE_TONE = { PENDING: 'amber', PROCESSING: 'blue', PAID: 'green' } as const;
const monthStart = () => `${istToday().slice(0, 8)}01`;

export default function OwnerEarningsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(istToday());
  const [range, setRange] = useState({ from: monthStart(), to: istToday() });
  const q = { from: range.from ? `${range.from}T00:00:00+05:30` : undefined, to: range.to ? `${range.to}T23:59:59+05:30` : undefined };
  const { data, error, loading, reload } = useApi<Earnings>('/owner/earnings', { query: q });
  const settlements = useApi<Settlement[]>('/owner/settlements');

  const presets = [
    { label: 'This month', from: monthStart(), to: istToday() },
    { label: 'Last 90 days', from: istToday(-90), to: istToday() },
    { label: 'This year', from: `${istToday().slice(0, 4)}-01-01`, to: istToday() },
    { label: 'All time', from: '', to: '' },
  ];

  return (
    <div>
      <PageHeader title="Earnings & payouts" subtitle="Completed trips, commission deducted and settlements to your bank." />

      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setRange({ from, to });
          }}
        >
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button type="submit">Apply</Button>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                  setRange({ from: p.from, to: p.to });
                }}
                className={
                  range.from === p.from && range.to === p.to
                    ? 'rounded-full bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full border border-mist-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-navy-300'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Trips" value={data.summary.trips} icon={<Route className="h-5 w-5" />} />
          <StatCard label="Gross billed" value={inr(data.summary.gross)} hint="Incl. GST & pass-through" icon={<Receipt className="h-5 w-5" />} tone="blue" />
          <StatCard label="GST collected" value={inr(data.summary.gst)} hint="Handled by platform" icon={<IndianRupee className="h-5 w-5" />} tone="amber" />
          <StatCard label="Commission" value={inr(data.summary.commission)} icon={<Percent className="h-5 w-5" />} tone="red" />
          <StatCard label="Your payout" value={inr(data.summary.payout)} icon={<Wallet className="h-5 w-5" />} tone="green" />
        </div>
      ) : null}

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 md:p-6 md:pb-0">
          <CardHeader title="Completed trips" subtitle={data && data.rows.length >= 200 ? 'Showing the latest 200 trips — narrow the date range to see more.' : undefined} />
        </div>
        {data && data.rows.length === 0 ? (
          <div className="p-5 md:p-6">
            <EmptyState title="No completed trips in this period" icon={<Route className="h-6 w-6" />} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Booking</th>
                  <th>Vehicle</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Payout</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDate(r.completedAt)}</td>
                    <td>
                      <Link href={`/owner/bookings/${r.id}`} className="font-mono text-xs font-semibold text-navy-700 hover:underline">
                        #{r.bookingNumber}
                      </Link>
                    </td>
                    <td className="max-w-[220px] truncate">
                      {r.vehicle.title} <span className="font-mono text-xs text-slate-500">{r.vehicle.registrationNumber}</span>
                    </td>
                    <td className="text-right tabular-nums">{inr(r.finalAmount)}</td>
                    <td className="text-right tabular-nums text-slate-500">{inr(r.taxAmount)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-red-600">
                      − {inr(r.commissionAmount)} <span className="text-xs text-slate-400">({r.commissionRate}%)</span>
                    </td>
                    <td className="text-right font-semibold tabular-nums text-emerald-700">{inr(r.ownerPayout)}</td>
                    <td>{r.settlementId ? <Badge tone="green">Settled</Badge> : <Badge tone="amber">Unsettled</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 md:p-6 md:pb-0">
          <CardHeader title="Settlements" subtitle="Payouts transferred to your bank account" />
        </div>
        {settlements.error && (
          <div className="px-5 pb-5">
            <ErrorState message={settlements.error} onRetry={settlements.reload} />
          </div>
        )}
        {settlements.loading && !settlements.data ? (
          <div className="p-5">
            <Skeleton className="h-24" />
          </div>
        ) : settlements.data && settlements.data.length === 0 ? (
          <div className="p-5 md:p-6">
            <EmptyState title="No settlements yet" description="Settlements are created periodically for completed trips." icon={<CheckCircle2 className="h-6 w-6" />} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Trips</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Adjustments</th>
                  <th className="text-right">Net paid</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {settlements.data?.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">
                      {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                    </td>
                    <td>{s._count.bookings}</td>
                    <td className="text-right tabular-nums">{inr(s.grossAmount)}</td>
                    <td className="text-right tabular-nums text-red-600">− {inr(s.commissionAmount)}</td>
                    <td className="text-right tabular-nums">{inr(s.adjustments)}</td>
                    <td className="text-right font-semibold tabular-nums text-emerald-700">{inr(s.netAmount)}</td>
                    <td>
                      <Badge tone={SETTLE_TONE[s.status]}>{titleCase(s.status)}</Badge>
                      {s.paidAt && <span className="block text-xs text-slate-500">{fmtDate(s.paidAt)}</span>}
                    </td>
                    <td className="font-mono text-xs">
                      {s.referenceNumber ?? '—'}
                      {s.note && <span className="block font-sans text-slate-500">{s.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
