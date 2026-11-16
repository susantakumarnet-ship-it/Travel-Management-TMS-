'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { Banknote, Check, Percent, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { fmtDate, fmtDateTime, inr, istToday, titleCase } from '@/lib/format';
import { Modal, PageHeader, StatCard, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Chips } from '@/components/admin/FilterBar';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useUrlFilters, usePerm } from '@/components/admin/hooks';
import { EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { SETTLEMENT_TONE, reportError } from '@/components/admin/utils';

interface Overview {
  categories: { id: string; name: string; commissionRate: number | null }[];
  owners: { id: string; businessName: string; commissionRate: number | null; trips: number; revenue: number; commission: number; payout: number; unsettled: number; unsettledTrips: number }[];
}
interface Settlement {
  id: string;
  ownerId: string;
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
  owner: { businessName: string; bankAccountName: string | null; bankAccountNumber: string | null; bankIfsc: string | null; upiId: string | null };
  _count: { bookings: number };
}

/** Inline-editable percentage cell. Empty = inherit. */
function RateEditor({ value, placeholder, disabled, onSave }: { value: number | null; placeholder: string; disabled: boolean; onSave: (v: number | null) => Promise<void> }) {
  const [v, setV] = useState(value == null ? '' : String(Number(value)));
  const [busy, setBusy] = useState(false);
  const dirty = v !== (value == null ? '' : String(Number(value)));
  const invalid = v !== '' && (Number(v) < 0 || Number(v) > 100 || Number.isNaN(Number(v)));
  return (
    <div className="flex items-center gap-1">
      <div className="relative w-24">
        <input className="input h-9 py-0 pr-7 text-right" type="number" min={0} max={100} step="0.5" value={v} placeholder={placeholder} disabled={disabled || busy} onChange={(e) => setV(e.target.value)} aria-label="Commission %" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
      </div>
      {dirty && !disabled && (
        <button
          type="button"
          disabled={invalid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(v === '' ? null : Number(v));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-navy-900 p-1.5 text-white hover:bg-navy-800 disabled:opacity-40"
          aria-label="Save rate"
        >
          <Check className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function OverviewTab({ defaultPct }: { defaultPct: number | null }) {
  const { data, loading, error, reload } = useApi<Overview>('/admin/commissions');
  const cat = usePerm('categories');
  const own = usePerm('owners');
  const { canWrite } = usePerm('commissions');
  const [settleFor, setSettleFor] = useState<Overview['owners'][number] | null>(null);
  const def = defaultPct != null ? `${defaultPct}` : 'default';

  async function saveCategory(id: string, rate: number | null) {
    try {
      await api(`/admin/categories/${id}`, { method: 'PUT', body: { commissionRate: rate } });
      toast.success('Category commission updated');
      reload();
    } catch (e) {
      reportError(e);
    }
  }
  async function saveOwner(id: string, rate: number | null) {
    try {
      await api(`/admin/owners/${id}`, { method: 'PATCH', body: { commissionRate: rate } });
      toast.success('Owner commission override updated');
      reload();
    } catch (e) {
      reportError(e);
    }
  }

  const owners = data?.owners ?? [];
  const totals = owners.reduce((a, o) => ({ commission: a.commission + o.commission, unsettled: a.unsettled + o.unsettled, revenue: a.revenue + o.revenue }), { commission: 0, unsettled: 0, revenue: 0 });
  const ownerCols: Column<Overview['owners'][number]>[] = [
    { key: 'name', header: 'Owner', render: (o) => <Link href={`/admin/owners/${o.id}`} className="font-medium text-navy-900 hover:underline">{o.businessName}</Link> },
    { key: 'rate', header: 'Override', render: (o) => <RateEditor key={`${o.id}-${o.commissionRate}`} value={o.commissionRate} placeholder="Category" disabled={!own.canWrite} onSave={(v) => saveOwner(o.id, v)} /> },
    { key: 'trips', header: 'Trips', align: 'right', render: (o) => o.trips },
    { key: 'rev', header: 'Revenue', align: 'right', render: (o) => <span className="tabular-nums">{inr(o.revenue)}</span> },
    { key: 'com', header: 'Commission', align: 'right', render: (o) => <span className="tabular-nums">{inr(o.commission)}</span> },
    { key: 'pay', header: 'Payout', align: 'right', render: (o) => <span className="tabular-nums">{inr(o.payout)}</span> },
    {
      key: 'uns',
      header: 'Unsettled',
      align: 'right',
      render: (o) => (
        <div className="tabular-nums">
          <div className={o.unsettled > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}>{inr(o.unsettled)}</div>
          {o.unsettledTrips > 0 && <div className="text-xs text-slate-500">{o.unsettledTrips} trips</div>}
        </div>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (o) =>
        canWrite && o.unsettled > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setSettleFor(o)}>
            Create settlement
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Commission earned" value={inr(totals.commission)} icon={<Percent className="h-5 w-5" />} tone="gold" hint="Completed trips" />
        <StatCard label="Completed-trip revenue" value={inr(totals.revenue)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Owed to owners" value={inr(totals.unsettled)} icon={<Wallet className="h-5 w-5" />} tone="amber" hint="Unsettled payouts" />
      </div>
      <Section title="Category commission rates" subtitle={`Applies to vehicles in each category. Empty uses the platform default${defaultPct != null ? ` (${defaultPct}%)` : ''}. Owner overrides take precedence.`}>
        {loading && !data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data?.categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-mist-200 px-4 py-3">
                <span className="text-sm font-medium text-navy-900">{c.name}</span>
                <RateEditor key={`${c.id}-${c.commissionRate}`} value={c.commissionRate} placeholder={def} disabled={!cat.canWrite} onSave={(v) => saveCategory(c.id, v)} />
              </div>
            ))}
          </div>
        )}
      </Section>
      <div>
        <h3 className="mb-3 text-base font-semibold text-navy-900">Owner balances & overrides</h3>
        <DataTable columns={ownerCols} rows={owners} loading={loading} error={error} onRetry={reload} rowKey={(o) => o.id} empty="No owners yet" />
      </div>
      {settleFor && <CreateSettlementModal owner={settleFor} onClose={() => setSettleFor(null)} onDone={reload} />}
    </div>
  );
}

function CreateSettlementModal({ owner, onClose, onDone }: { owner: { id: string; businessName: string; unsettled: number; unsettledTrips: number }; onClose: () => void; onDone: () => void }) {
  const [periodEnd, setPeriodEnd] = useState(istToday());
  const [adjustments, setAdj] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit() {
    setBusy(true);
    try {
      await api('/admin/settlements', { method: 'POST', body: { ownerId: owner.id, periodEnd: new Date(`${periodEnd}T23:59:59+05:30`).toISOString(), adjustments: Number(adjustments) || 0, note: note.trim() || undefined } });
      toast.success('Settlement created');
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
      title={`Settle ${owner.businessName}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" loading={busy} onClick={submit}>
            Create settlement
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-mist-50 px-4 py-3 text-sm text-slate-600">
        Bundles all completed, unsettled trips up to the period end. Currently {owner.unsettledTrips} trips · {inr(owner.unsettled)}.
      </p>
      <div className="space-y-4">
        <Field label="Period end" required error={errors.periodEnd}>
          <Input type="date" value={periodEnd} max={istToday()} onChange={(e) => setPeriodEnd(e.target.value)} />
        </Field>
        <Field label="Adjustments (₹)" error={errors.adjustments} hint="Positive adds to the payout, negative deducts (e.g. damages)">
          <Input type="number" step="0.01" value={adjustments} onChange={(e) => setAdj(e.target.value)} />
        </Field>
        <Field label="Note" error={errors.note}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

function SettlementsTab() {
  const { values, page, set, setPage } = useUrlFilters({ tab: 'overview', status: '' });
  const { data, loading, error, reload } = useApi<Paged<Settlement>>('/admin/settlements', { query: { page, pageSize: 20, status: values.status } });
  const { canWrite } = usePerm('commissions');
  const [paying, setPaying] = useState<Settlement | null>(null);
  const [deleting, setDeleting] = useState<Settlement | null>(null);

  async function update(s: Settlement, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/admin/settlements/${s.id}`, { method: 'PATCH', body });
      toast.success(msg);
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  const cols: Column<Settlement>[] = [
    { key: 'owner', header: 'Owner', render: (s) => <Link href={`/admin/owners/${s.ownerId}`} className="font-medium text-navy-900 hover:underline">{s.owner.businessName}</Link> },
    { key: 'period', header: 'Period', render: (s) => <span className="whitespace-nowrap">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</span> },
    { key: 'trips', header: 'Trips', align: 'right', render: (s) => s._count.bookings },
    { key: 'gross', header: 'Gross', align: 'right', render: (s) => <span className="tabular-nums">{inr(Number(s.grossAmount))}</span> },
    { key: 'com', header: 'Commission', align: 'right', render: (s) => <span className="tabular-nums">{inr(Number(s.commissionAmount))}</span> },
    { key: 'adj', header: 'Adj.', align: 'right', render: (s) => <span className="tabular-nums">{inr(Number(s.adjustments))}</span> },
    { key: 'net', header: 'Net payout', align: 'right', render: (s) => <span className="font-semibold tabular-nums text-navy-900">{inr(Number(s.netAmount))}</span> },
    {
      key: 'bank',
      header: 'Pay to',
      render: (s) => (
        <div className="max-w-[200px] text-xs text-slate-600">
          {s.owner.bankAccountNumber ? (
            <>
              <div className="truncate">{s.owner.bankAccountName}</div>
              <div>
                {s.owner.bankAccountNumber} · {s.owner.bankIfsc}
              </div>
            </>
          ) : null}
          {s.owner.upiId && <div>UPI: {s.owner.upiId}</div>}
          {!s.owner.bankAccountNumber && !s.owner.upiId && <span className="text-amber-700">No bank details</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <div>
          <EnumBadge value={s.status} tones={SETTLEMENT_TONE} />
          {s.referenceNumber && <div className="text-xs text-slate-500">Ref {s.referenceNumber}</div>}
          {s.paidAt && <div className="text-xs text-slate-500">{fmtDateTime(s.paidAt)}</div>}
        </div>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (s) =>
        canWrite && s.status !== 'PAID' ? (
          <div className="flex justify-end gap-1">
            {s.status === 'PENDING' && (
              <Button size="sm" variant="outline" onClick={() => update(s, { status: 'PROCESSING' }, 'Marked as processing').catch(() => undefined)}>
                Processing
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => setPaying(s)}>
              Mark paid
            </Button>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting(s)}>
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <Chips<string>
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[{ value: '', label: 'All' }, ...(['PENDING', 'PROCESSING', 'PAID'] as const).map((s) => ({ value: s, label: titleCase(s) }))]}
      />
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={(s) => s.id} empty="No settlements" page={page} totalPages={data?.totalPages} total={data?.total} onPage={setPage} />
      {paying && <MarkPaidModal s={paying} onClose={() => setPaying(null)} onSubmit={(ref, note) => update(paying, { status: 'PAID', referenceNumber: ref, note: note || undefined }, 'Settlement marked as paid')} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete settlement"
        message={deleting ? `Delete the ${inr(Number(deleting.netAmount))} settlement for ${deleting.owner.businessName}? Its ${deleting._count.bookings} trips will return to the unsettled balance.` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api(`/admin/settlements/${deleting!.id}`, { method: 'DELETE' });
            toast.success('Settlement deleted');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
    </div>
  );
}

function MarkPaidModal({ s, onClose, onSubmit }: { s: Settlement; onClose: () => void; onSubmit: (ref: string, note: string) => Promise<void> }) {
  const [ref, setRef] = useState('');
  const [note, setNote] = useState(s.note ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Mark settlement as paid"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!ref.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(ref.trim(), note.trim());
                onClose();
              } catch {
                /* reported */
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark paid
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Pay <strong className="text-navy-900">{inr(Number(s.netAmount))}</strong> to {s.owner.businessName}. The owner will be notified.
      </p>
      <div className="space-y-4">
        <Field label="Transaction reference" required hint="Bank UTR / UPI transaction ID">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <Field label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

function CommissionsInner() {
  const { values, set } = useUrlFilters({ tab: 'overview', status: '' });
  const settings = usePerm('settings');
  const { data: st } = useApi<{ values: Record<string, unknown> }>(settings.canRead ? '/admin/settings' : null);
  const defaultPct = st ? Number(st.values['commission.defaultPercent']) : null;
  return (
    <div>
      <PageHeader title="Commissions & settlements" subtitle={`Platform commission${defaultPct != null ? ` (default ${defaultPct}%)` : ''}, owner balances and payouts`} />
      <Tabs
        value={values.tab as 'overview' | 'settlements'}
        onChange={(t) => set({ tab: t, status: '' })}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'settlements', label: 'Settlements' },
        ]}
      />
      {values.tab === 'settlements' ? <SettlementsTab /> : <OverviewTab defaultPct={defaultPct} />}
    </div>
  );
}

export default function CommissionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CommissionsInner />
    </Suspense>
  );
}
