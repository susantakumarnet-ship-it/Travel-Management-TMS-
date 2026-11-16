'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Ban, CheckCircle2, Pencil, Star, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { BookingStatus, Paged } from '@/lib/types';
import { fmtDate, fmtDateTime, inr, titleCase } from '@/lib/format';
import { Badge, DL, ErrorState, Modal, PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { BackLink, EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { DocumentList, type AdminDocument } from '@/components/admin/DocumentList';
import { usePerm } from '@/components/admin/hooks';
import { USER_STATUS_TONE, VERIFICATION_TONE, daysUntil, reportError } from '@/components/admin/utils';

interface DriverDetail {
  id: string;
  licenceNumber: string;
  licenceExpiry: string;
  experienceYears: number;
  languages: string[];
  dateOfBirth: string | null;
  address: string | null;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  verificationNote: string | null;
  isAvailable: boolean;
  ratingAvg: number;
  ratingCount: number;
  dailyWage: number;
  createdAt: string;
  user: { name: string | null; phone: string; email: string | null; status: string; createdAt: string };
  owner: { id: string; businessName: string } | null;
  documents: AdminDocument[];
  assignments: { id: string; status: string; driverEarning: number; assignedAt: string; respondedAt: string | null; note: string | null; booking: { id: string; bookingNumber: string; status: BookingStatus; pickupAt: string } }[];
  reviews: { driverRating: number | null; comment: string | null; createdAt: string }[];
}

type Kind = 'approve' | 'reject' | 'suspend' | 'activate';
const ASSIGN_TONE = { ASSIGNED: 'blue', ACCEPTED: 'indigo', REJECTED: 'red', CANCELLED: 'gray', COMPLETED: 'green' } as const;

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canWrite } = usePerm('drivers');
  const { data: d, loading, error, reload } = useApi<DriverDetail>(`/admin/drivers/${id}`);
  const owners = useApi<Paged<{ id: string; businessName: string }>>(canWrite ? '/admin/owners' : null, { query: { pageSize: 100 } });
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [edit, setEdit] = useState(false);
  const [wage, setWage] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (loading && !d) return <PageSkeleton />;
  if (error || !d) return <ErrorState message={error ?? 'Driver not found'} onRetry={reload} />;

  async function patch(body: Record<string, unknown>, msg: string) {
    try {
      await api(`/admin/drivers/${id}`, { method: 'PATCH', body });
      toast.success(msg);
      reload();
    } catch (e) {
      setErrors(reportError(e));
      throw e;
    }
  }
  function onConfirm(k: Kind, note: string) {
    if (k === 'approve') return patch({ verificationStatus: 'APPROVED', verificationNote: note || null }, 'Driver verified');
    if (k === 'reject') return patch({ verificationStatus: 'REJECTED', verificationNote: note }, 'Driver rejected');
    if (k === 'suspend') return patch({ userStatus: 'SUSPENDED' }, 'Account suspended');
    return patch({ userStatus: 'ACTIVE' }, 'Account activated');
  }
  async function saveEdit() {
    const w = Number(wage);
    if (wage === '' || Number.isNaN(w) || w < 0) return setErrors({ dailyWage: 'Enter a valid amount' });
    setBusy(true);
    try {
      await patch({ dailyWage: w, ownerId: ownerId || null }, 'Driver updated');
      setEdit(false);
    } catch {
      /* reported */
    } finally {
      setBusy(false);
    }
  }

  const suspended = d.user.status === 'SUSPENDED';
  const days = daysUntil(d.licenceExpiry) ?? 999;
  const completed = d.assignments.filter((a) => a.status === 'COMPLETED');
  const earnings = completed.reduce((s, a) => s + Number(a.driverEarning), 0);
  const copy: Record<Kind, { title: string; message: string; label: string; tone: 'primary' | 'danger' }> = {
    approve: { title: 'Verify driver', message: 'The driver will be able to receive trip assignments. Make sure the licence and police verification are checked.', label: 'Verify', tone: 'primary' },
    reject: { title: 'Reject driver', message: 'The driver will be notified with your note.', label: 'Reject', tone: 'danger' },
    suspend: { title: 'Suspend account', message: 'The driver will be signed out and cannot receive trips.', label: 'Suspend', tone: 'danger' },
    activate: { title: 'Activate account', message: 'The driver will be able to sign in again.', label: 'Activate', tone: 'primary' },
  };

  return (
    <>
      <PageHeader
        back={<BackLink href="/admin/drivers" label="Drivers" />}
        title={d.user.name ?? 'Unnamed driver'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {d.user.phone} {d.user.email && `· ${d.user.email}`}
            <EnumBadge value={d.verificationStatus} tones={VERIFICATION_TONE} />
            <EnumBadge value={d.user.status} tones={USER_STATUS_TONE} />
            <Badge tone={d.isAvailable ? 'green' : 'gray'}>{d.isAvailable ? 'Available' : 'Off duty'}</Badge>
          </span>
        }
        actions={
          canWrite && (
            <>
              {d.verificationStatus !== 'APPROVED' && (
                <Button variant="gold" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setConfirm('approve')}>
                  Verify
                </Button>
              )}
              {d.verificationStatus !== 'REJECTED' && (
                <Button variant="outline" icon={<XCircle className="h-4 w-4" />} onClick={() => setConfirm('reject')}>
                  Reject
                </Button>
              )}
              <Button variant="outline" icon={suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />} onClick={() => setConfirm(suspended ? 'activate' : 'suspend')}>
                {suspended ? 'Activate' : 'Suspend'}
              </Button>
            </>
          )
        }
      />
      {d.verificationNote && <p className="mb-4 rounded-xl border border-mist-200 bg-white px-4 py-2 text-sm text-slate-600">Verification note: {d.verificationNote}</p>}
      {days <= 30 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Driving licence {days < 0 ? 'expired' : `expires in ${days} day(s)`} on {fmtDate(d.licenceExpiry)}.
        </p>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed trips" value={completed.length} />
        <StatCard label="Earnings (recent 50)" value={inr(earnings)} tone="gold" />
        <StatCard label="Rating" value={d.ratingCount ? `${Number(d.ratingAvg).toFixed(1)} / 5` : '—'} hint={`${d.ratingCount} rating(s)`} tone="blue" />
        <StatCard label="Daily wage" value={inr(Number(d.dailyWage))} tone="green" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Section
            title="Profile"
            action={
              canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setWage(String(Number(d.dailyWage)));
                    setOwnerId(d.owner?.id ?? '');
                    setErrors({});
                    setEdit(true);
                  }}
                >
                  Wage & owner
                </Button>
              )
            }
          >
            <DL
              cols={1}
              items={[
                ['Fleet owner', d.owner ? <Link href={`/admin/owners/${d.owner.id}`} className="text-navy-700 hover:underline">{d.owner.businessName}</Link> : 'Independent'],
                ['Licence no.', <span key="l" className="font-mono">{d.licenceNumber}</span>],
                ['Licence expiry', fmtDate(d.licenceExpiry)],
                ['Experience', `${d.experienceYears} years`],
                ['Languages', d.languages.length ? d.languages.join(', ') : null],
                ['Date of birth', d.dateOfBirth ? fmtDate(d.dateOfBirth) : null],
                ['Address', d.address],
                ['Joined', fmtDate(d.createdAt)],
              ]}
            />
          </Section>
          <Section title="Ratings & reviews">
            {d.reviews.length ? (
              <ul className="space-y-3">
                {d.reviews.map((r, i) => (
                  <li key={i} className="text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-navy-900">
                      <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" /> {r.driverRating ?? '—'}/5
                    </span>
                    <span className="ml-2 text-xs text-slate-500">{fmtDate(r.createdAt)}</span>
                    {r.comment && <p className="mt-0.5 text-slate-600">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No reviews yet.</p>
            )}
          </Section>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Section title="Documents" subtitle="Licence, Aadhaar, police verification">
            <DocumentList docs={d.documents} endpoint="/admin/driver-documents" canWrite={canWrite} onChanged={reload} />
          </Section>
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Assignments</h3>
            <DataTable
              rows={d.assignments}
              rowKey={(a) => a.id}
              rowHref={(a) => `/admin/bookings/${a.booking.id}`}
              empty="No trips assigned yet"
              columns={[
                { key: 'b', header: 'Booking', render: (a) => <Link href={`/admin/bookings/${a.booking.id}`} className="font-semibold text-navy-900 hover:underline">{a.booking.bookingNumber}</Link> },
                { key: 'p', header: 'Pickup', render: (a) => fmtDateTime(a.booking.pickupAt) },
                { key: 'bs', header: 'Booking status', render: (a) => <StatusBadge status={a.booking.status} /> },
                { key: 'as', header: 'Assignment', render: (a) => <Badge tone={ASSIGN_TONE[a.status as keyof typeof ASSIGN_TONE] ?? 'gray'}>{titleCase(a.status)}</Badge> },
                { key: 'at', header: 'Assigned', render: (a) => fmtDateTime(a.assignedAt) },
                { key: 'e', header: 'Earning', align: 'right', render: (a) => inr(Number(a.driverEarning)) },
              ]}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? copy[confirm].title : ''}
        message={confirm ? copy[confirm].message : ''}
        confirmLabel={confirm ? copy[confirm].label : ''}
        tone={confirm ? copy[confirm].tone : 'primary'}
        reason={confirm === 'reject' ? 'Note to driver' : confirm === 'approve' ? 'Note (optional)' : undefined}
        reasonRequired={confirm === 'reject'}
        onConfirm={(note) => onConfirm(confirm!, note)}
      />
      <Modal
        open={edit}
        onClose={() => setEdit(false)}
        title="Wage & fleet owner"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Daily wage (₹)" error={errors.dailyWage} hint="Driver's share per trip day">
            <Input type="number" min={0} value={wage} onChange={(e) => setWage(e.target.value)} invalid={!!errors.dailyWage} />
          </Field>
          <Field label="Fleet owner" error={errors.ownerId}>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Independent (no owner)</option>
              {d.owner && !owners.data?.items.some((o) => o.id === d.owner!.id) && <option value={d.owner.id}>{d.owner.businessName}</option>}
              {owners.data?.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.businessName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
