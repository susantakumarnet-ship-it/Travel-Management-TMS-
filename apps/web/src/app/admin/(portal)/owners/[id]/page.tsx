'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Ban, CheckCircle2, Pencil, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr, titleCase } from '@/lib/format';
import { DL, ErrorState, Modal, PageHeader, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { BackLink, EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { DocumentList, type AdminDocument } from '@/components/admin/DocumentList';
import { usePerm } from '@/components/admin/hooks';
import { SETTLEMENT_TONE, USER_STATUS_TONE, VEHICLE_STATUS_TONE, VERIFICATION_TONE, reportError } from '@/components/admin/utils';

interface OwnerDetail {
  id: string;
  businessName: string;
  contactPerson: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  panNumber: string | null;
  gstin: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  commissionRate: number | null;
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  kycNote: string | null;
  createdAt: string;
  user: { name: string | null; phone: string; email: string | null; status: string; createdAt: string };
  documents: AdminDocument[];
  vehicles: { id: string; title: string; registrationNumber: string; status: string }[];
  drivers: { id: string; verificationStatus: string; user: { name: string | null; phone: string } }[];
  settlements: { id: string; periodStart: string; periodEnd: string; netAmount: number; status: string; referenceNumber: string | null; paidAt: string | null; createdAt: string }[];
  totals: { trips: number; revenue: number; commission: number; payout: number; unsettled: number; unsettledTrips: number };
}

type Confirm = { kind: 'approve' | 'reject' | 'suspend' | 'activate' };

export default function OwnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canWrite } = usePerm('owners');
  const { data: o, loading, error, reload } = useApi<OwnerDetail>(`/admin/owners/${id}`);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [commOpen, setCommOpen] = useState(false);
  const [comm, setComm] = useState('');
  const [commErr, setCommErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !o) return <PageSkeleton />;
  if (error || !o) return <ErrorState message={error ?? 'Owner not found'} onRetry={reload} />;

  async function patch(body: Record<string, unknown>, msg: string) {
    try {
      await api(`/admin/owners/${id}`, { method: 'PATCH', body });
      toast.success(msg);
      reload();
    } catch (e) {
      const fe = reportError(e);
      if (fe.commissionRate) setCommErr(fe.commissionRate);
      throw e;
    }
  }
  async function onConfirm(c: Confirm, note: string) {
    if (c.kind === 'approve') return patch({ kycStatus: 'APPROVED', kycNote: note || null }, 'KYC approved');
    if (c.kind === 'reject') return patch({ kycStatus: 'REJECTED', kycNote: note }, 'KYC rejected');
    if (c.kind === 'suspend') return patch({ userStatus: 'SUSPENDED' }, 'Account suspended');
    return patch({ userStatus: 'ACTIVE' }, 'Account activated');
  }
  async function saveCommission(clear = false) {
    const value = clear || comm === '' ? null : Number(comm);
    if (value != null && (Number.isNaN(value) || value < 0 || value > 100)) return setCommErr('Enter a percentage between 0 and 100');
    setBusy(true);
    try {
      await patch({ commissionRate: value }, value == null ? 'Commission override cleared' : 'Commission updated');
      setCommOpen(false);
    } catch {
      /* reported */
    } finally {
      setBusy(false);
    }
  }

  const suspended = o.user.status === 'SUSPENDED';
  const confirmCopy: Record<Confirm['kind'], { title: string; message: string; label: string; tone: 'primary' | 'danger' }> = {
    approve: { title: 'Approve KYC', message: 'The owner will be notified and their approved vehicles can start receiving bookings.', label: 'Approve', tone: 'primary' },
    reject: { title: 'Reject KYC', message: 'The owner will be notified with your note so they can re-submit documents.', label: 'Reject', tone: 'danger' },
    suspend: { title: 'Suspend account', message: 'The owner will not be able to sign in. Their vehicles stay listed until deactivated.', label: 'Suspend', tone: 'danger' },
    activate: { title: 'Activate account', message: 'The owner will be able to sign in again.', label: 'Activate', tone: 'primary' },
  };

  return (
    <>
      <PageHeader
        back={<BackLink href="/admin/owners" label="Vehicle owners" />}
        title={o.businessName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {o.user.name ?? o.contactPerson} · {o.user.phone} {o.user.email && `· ${o.user.email}`}
            <EnumBadge value={o.kycStatus} tones={VERIFICATION_TONE} label={`KYC ${o.kycStatus.toLowerCase()}`} />
            <EnumBadge value={o.user.status} tones={USER_STATUS_TONE} />
          </span>
        }
        actions={
          canWrite && (
            <>
              {o.kycStatus !== 'APPROVED' && (
                <Button variant="gold" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setConfirm({ kind: 'approve' })}>
                  Approve KYC
                </Button>
              )}
              {o.kycStatus !== 'REJECTED' && (
                <Button variant="outline" icon={<XCircle className="h-4 w-4" />} onClick={() => setConfirm({ kind: 'reject' })}>
                  Reject KYC
                </Button>
              )}
              <Button variant="outline" icon={suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />} onClick={() => setConfirm({ kind: suspended ? 'activate' : 'suspend' })}>
                {suspended ? 'Activate' : 'Suspend'}
              </Button>
            </>
          )
        }
      />
      {o.kycNote && <p className="mb-4 rounded-xl border border-mist-200 bg-white px-4 py-2 text-sm text-slate-600">KYC note: {o.kycNote}</p>}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed trips" value={o.totals.trips} />
        <StatCard label="Trip revenue" value={inr(o.totals.revenue)} tone="gold" />
        <StatCard label="Commission earned" value={inr(o.totals.commission)} tone="blue" hint={`Payout ${inr(o.totals.payout)}`} />
        <StatCard label="Unsettled payout" value={inr(o.totals.unsettled)} tone={o.totals.unsettled > 0 ? 'amber' : 'green'} hint={`${o.totals.unsettledTrips} trip(s)`} href="/admin/commissions" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Section
            title="Business"
            action={
              canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setComm(o.commissionRate == null ? '' : String(o.commissionRate));
                    setCommErr('');
                    setCommOpen(true);
                  }}
                >
                  Commission
                </Button>
              )
            }
          >
            <DL
              cols={1}
              items={[
                ['Commission', o.commissionRate == null ? 'Category default' : `${Number(o.commissionRate)}% (override)`],
                ['Contact person', o.contactPerson],
                ['Address', [o.address, o.city, o.state].filter(Boolean).join(', ') || null],
                ['PAN', o.panNumber],
                ['GSTIN', o.gstin],
                ['Partner since', fmtDate(o.createdAt)],
              ]}
            />
          </Section>
          <Section title="Payout account">
            <DL
              cols={1}
              items={[
                ['Account name', o.bankAccountName],
                ['Account number', o.bankAccountNumber],
                ['IFSC', o.bankIfsc],
                ['UPI', o.upiId],
              ]}
            />
          </Section>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Section title="KYC documents">
            <DocumentList docs={o.documents.map((d) => ({ ...d, expiresAt: null }))} endpoint="/admin/owner-documents" canWrite={canWrite} onChanged={reload} />
          </Section>
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Vehicles ({o.vehicles.length})</h3>
            <DataTable
              rows={o.vehicles}
              rowKey={(v) => v.id}
              rowHref={(v) => `/admin/vehicles/${v.id}`}
              empty="No vehicles listed"
              columns={[
                { key: 't', header: 'Vehicle', render: (v) => <Link href={`/admin/vehicles/${v.id}`} className="font-medium text-navy-900 hover:underline">{v.title}</Link> },
                { key: 'r', header: 'Registration', render: (v) => <span className="font-mono text-xs">{v.registrationNumber}</span> },
                { key: 's', header: 'Status', render: (v) => <EnumBadge value={v.status} tones={VEHICLE_STATUS_TONE} /> },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Drivers ({o.drivers.length})</h3>
            <DataTable
              rows={o.drivers}
              rowKey={(d) => d.id}
              rowHref={(d) => `/admin/drivers/${d.id}`}
              empty="No drivers linked"
              columns={[
                { key: 'n', header: 'Driver', render: (d) => <Link href={`/admin/drivers/${d.id}`} className="font-medium text-navy-900 hover:underline">{d.user.name ?? 'Unnamed'}</Link> },
                { key: 'p', header: 'Phone', render: (d) => d.user.phone },
                { key: 's', header: 'Verification', render: (d) => <EnumBadge value={d.verificationStatus} tones={VERIFICATION_TONE} /> },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Recent settlements</h3>
            <DataTable
              rows={o.settlements}
              rowKey={(s) => s.id}
              empty="No settlements yet"
              columns={[
                { key: 'p', header: 'Period', render: (s) => `${fmtDate(s.periodStart)} – ${fmtDate(s.periodEnd)}` },
                { key: 'a', header: 'Net payout', align: 'right', render: (s) => inr(Number(s.netAmount)) },
                { key: 's', header: 'Status', render: (s) => <EnumBadge value={s.status} tones={SETTLEMENT_TONE} label={titleCase(s.status)} /> },
                { key: 'r', header: 'Reference', render: (s) => s.referenceNumber ?? '—' },
                { key: 'd', header: 'Paid on', render: (s) => fmtDate(s.paidAt) },
              ]}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? confirmCopy[confirm.kind].title : ''}
        message={confirm ? confirmCopy[confirm.kind].message : ''}
        confirmLabel={confirm ? confirmCopy[confirm.kind].label : ''}
        tone={confirm ? confirmCopy[confirm.kind].tone : 'primary'}
        reason={confirm?.kind === 'reject' ? 'Note to owner' : confirm?.kind === 'approve' ? 'Note (optional)' : undefined}
        reasonRequired={confirm?.kind === 'reject'}
        onConfirm={(note) => onConfirm(confirm!, note)}
      />
      <Modal
        open={commOpen}
        onClose={() => setCommOpen(false)}
        title="Commission override"
        size="sm"
        footer={
          <>
            {o.commissionRate != null && (
              <Button variant="ghost" onClick={() => saveCommission(true)} disabled={busy}>
                Clear override
              </Button>
            )}
            <Button onClick={() => saveCommission()} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Commission %" error={commErr} hint="Overrides the category commission for all of this owner's bookings. Leave blank to use category rates.">
          <Input type="number" step="0.01" min={0} max={100} value={comm} onChange={(e) => setComm(e.target.value)} invalid={!!commErr} autoFocus />
        </Field>
      </Modal>
    </>
  );
}
