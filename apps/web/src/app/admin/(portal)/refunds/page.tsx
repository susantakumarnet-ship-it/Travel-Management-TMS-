'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { BookingStatus, Paged } from '@/lib/types';
import { fmtDateTime, inr, titleCase } from '@/lib/format';
import { Modal, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Chips } from '@/components/admin/FilterBar';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useUrlFilters, usePerm } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { REFUND_STATUS_TONE, reportError } from '@/components/admin/utils';

interface RefundRow {
  id: string;
  amount: number;
  status: 'INITIATED' | 'PROCESSED' | 'FAILED';
  reason: string | null;
  gatewayRefundId: string | null;
  failureReason: string | null;
  processedAt: string | null;
  createdAt: string;
  booking: { id: string; bookingNumber: string; customer: { name: string | null; phone: string } };
  payment: { gateway: string; gatewayPaymentId: string | null; method: string | null };
}

function RefundsInner() {
  const { values, page, set, setPage } = useUrlFilters({ status: '' });
  const { data, loading, error, reload } = useApi<Paged<RefundRow>>('/admin/refunds', { query: { page, pageSize: 25, status: values.status } });
  const { canWrite } = usePerm('refunds');
  const [settle, setSettle] = useState<RefundRow | null>(null);
  const [retry, setRetry] = useState<RefundRow | null>(null);
  const [initOpen, setInitOpen] = useState(false);

  const columns: Column<RefundRow>[] = [
    { key: 'date', header: 'Initiated', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
    {
      key: 'bk',
      header: 'Booking',
      render: (r) => <Cell primary={r.booking.bookingNumber} secondary={`${r.booking.customer.name ?? ''} ${r.booking.customer.phone}`} href={`/admin/bookings/${r.booking.id}`} />,
    },
    { key: 'via', header: 'Via', render: (r) => <Cell primary={titleCase(r.payment.gateway)} secondary={r.payment.method ?? undefined} /> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-[240px]">{r.reason ?? '—'}</span> },
    { key: 'amt', header: 'Amount', align: 'right', render: (r) => <span className="font-semibold tabular-nums text-navy-900">{inr(Number(r.amount))}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div>
          <EnumBadge value={r.status} tones={REFUND_STATUS_TONE} />
          {r.processedAt && <div className="text-xs text-slate-500">{fmtDateTime(r.processedAt)}</div>}
          {r.failureReason && <div className="max-w-[180px] truncate text-xs text-red-600" title={r.failureReason}>{r.failureReason}</div>}
        </div>
      ),
    },
    { key: 'refid', header: 'Reference', render: (r) => <span className="text-xs text-slate-500">{r.gatewayRefundId ?? '—'}</span> },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (r) =>
        canWrite ? (
          r.status === 'INITIATED' ? (
            <Button size="sm" variant="outline" onClick={() => setSettle(r)}>
              Settle manually
            </Button>
          ) : r.status === 'FAILED' ? (
            <Button size="sm" variant="outline" onClick={() => setRetry(r)}>
              Retry
            </Button>
          ) : null
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Refunds"
        subtitle="Gateway refunds are processed automatically; cash / bank refunds are settled manually"
        actions={
          canWrite ? (
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setInitOpen(true)}>
              Initiate refund
            </Button>
          ) : undefined
        }
      />
      <Chips<string>
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[
          { value: '', label: 'All' },
          { value: 'INITIATED', label: 'Initiated' },
          { value: 'PROCESSED', label: 'Processed' },
          { value: 'FAILED', label: 'Failed' },
        ]}
      />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id} empty="No refunds" page={page} totalPages={data?.totalPages} total={data?.total} onPage={setPage} />

      {settle && <SettleModal refund={settle} onClose={() => setSettle(null)} onDone={reload} />}
      <ConfirmDialog
        open={!!retry}
        onClose={() => setRetry(null)}
        title="Retry refund"
        message={retry ? `Start a fresh refund of ${inr(Number(retry.amount))} for ${retry.booking.bookingNumber}?` : ''}
        confirmLabel="Retry refund"
        tone="primary"
        onConfirm={async () => {
          try {
            await api(`/admin/refunds/${retry!.id}/retry`, { method: 'POST', body: {} });
            toast.success('Refund re-initiated');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
      {initOpen && <InitiateRefundModal onClose={() => setInitOpen(false)} onDone={reload} />}
    </div>
  );
}

function SettleModal({ refund, onClose, onDone }: { refund: RefundRow; onClose: () => void; onDone: () => void }) {
  const [success, setSuccess] = useState('true');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await api(`/admin/refunds/${refund.id}/settle`, { method: 'POST', body: { success: success === 'true', reference: reference.trim() || undefined } });
      toast.success(success === 'true' ? 'Refund marked as processed' : 'Refund marked as failed');
      onDone();
      onClose();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Settle refund manually"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={success === 'true' && !reference.trim()} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {inr(Number(refund.amount))} for {refund.booking.bookingNumber} via {titleCase(refund.payment.gateway)}.
      </p>
      <div className="space-y-4">
        <Field label="Outcome">
          <Select value={success} onChange={(e) => setSuccess(e.target.value)}>
            <option value="true">Paid out to customer (processed)</option>
            <option value="false">Failed</option>
          </Select>
        </Field>
        <Field label="Reference" required={success === 'true'} hint="UTR / UPI reference / cash receipt number">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
        </Field>
      </div>
    </Modal>
  );
}

interface BookingPick {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  paidAmount: number;
  customer: { name: string | null; phone: string };
}

function InitiateRefundModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<BookingPick | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { data, loading } = useApi<Paged<BookingPick>>(term ? '/admin/bookings' : null, { query: { q: term, pageSize: 10 } });

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setErrors({});
    try {
      await api('/admin/refunds', { method: 'POST', body: { bookingId: picked.id, amount: Number(amount), reason: reason.trim() } });
      toast.success('Refund initiated');
      onDone();
      onClose();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Initiate refund"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" loading={busy} disabled={!picked || !Number(amount) || reason.trim().length < 3} onClick={submit}>
            Initiate refund
          </Button>
        </>
      }
    >
      {!picked ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTerm(q.trim());
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking number or customer phone" autoFocus />
            <Button type="submit" variant="outline">
              Find
            </Button>
          </form>
          {loading && <p className="mt-3 text-sm text-slate-500">Searching…</p>}
          <ul className="mt-3 divide-y divide-mist-100">
            {data?.items.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={Number(b.paidAmount) <= 0}
                  onClick={() => {
                    setPicked(b);
                    setAmount(String(Number(b.paidAmount)));
                  }}
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left text-sm hover:bg-mist-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex-1">
                    <span className="font-semibold text-navy-900">{b.bookingNumber}</span>
                    <span className="block text-xs text-slate-500">
                      {b.customer.name ?? ''} {b.customer.phone} · paid {inr(Number(b.paidAmount))}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </button>
              </li>
            ))}
            {term && !loading && !data?.items.length && <li className="py-4 text-center text-sm text-slate-500">No bookings found</li>}
          </ul>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-mist-200 bg-mist-50 px-4 py-3 text-sm">
            <span>
              <Link href={`/admin/bookings/${picked.id}`} className="font-semibold text-navy-900 hover:underline">
                {picked.bookingNumber}
              </Link>
              <span className="block text-xs text-slate-500">Paid {inr(Number(picked.paidAmount))}</span>
            </span>
            <button type="button" className="text-xs font-semibold text-navy-700 hover:underline" onClick={() => setPicked(null)}>
              Change
            </button>
          </div>
          <Field label="Amount (₹)" required error={errors.amount}>
            <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} />
          </Field>
          <Field label="Reason" required error={errors.reason}>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export default function RefundsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RefundsInner />
    </Suspense>
  );
}
