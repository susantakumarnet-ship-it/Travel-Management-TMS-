'use client';

import Link from 'next/link';
import { Suspense, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Ban, CheckCircle2, ImagePlus, Plus, Star, Trash2, Wrench, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { BookingStatus } from '@/lib/types';
import { fmtDateTime, inr, toLocalInput, fromLocalInput, titleCase } from '@/lib/format';
import { Badge, ErrorState, Modal, PageHeader, StatusBadge, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { BackLink, EnumBadge, PageSkeleton, ReadOnlyNotice, Section, Switch } from '@/components/admin/bits';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { DocumentList, type AdminDocument } from '@/components/admin/DocumentList';
import { usePerm } from '@/components/admin/hooks';
import { VehicleForm, type AdminVehicle } from '@/components/admin/VehicleForm';
import { VEHICLE_STATUS_TONE, reportError } from '@/components/admin/utils';

interface VehicleDetail extends AdminVehicle {
  status: string;
  statusNote: string | null;
  ratingAvg: number;
  ratingCount: number;
  owner: { id: string; businessName: string };
  category: { name: string };
  model: { make: string; name: string };
  city: { name: string };
  images: { id: string; url: string; isPrimary: boolean; alt: string | null }[];
  documents: AdminDocument[];
  availability: { id: string; type: 'BOOKING' | 'MAINTENANCE' | 'OWNER_BLOCK'; startAt: string; endAt: string; reason: string | null; holdExpiresAt: string | null; booking: { bookingNumber: string; status: BookingStatus } | null; bookingId: string | null }[];
  bookings: { id: string; bookingNumber: string; status: BookingStatus; pickupAt: string; returnAt: string; totalAmount: number; finalAmount: number | null; customer: { name: string | null } }[];
}

type Tab = 'details' | 'photos' | 'documents' | 'availability' | 'bookings';
type StatusAction = { status: 'ACTIVE' | 'REJECTED' | 'MAINTENANCE' | 'INACTIVE'; title: string; message: string; label: string; tone: 'primary' | 'danger'; reason?: boolean };

function VehicleDetailInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { canWrite } = usePerm('vehicles');
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'details');
  const { data: v, loading, error, reload } = useApi<VehicleDetail>(`/admin/vehicles/${id}`);
  const [action, setAction] = useState<StatusAction | null>(null);

  if (loading && !v) return <PageSkeleton />;
  if (error || !v) return <ErrorState message={error ?? 'Vehicle not found'} onRetry={reload} />;

  async function changeStatus(a: StatusAction, note: string) {
    try {
      await api(`/admin/vehicles/${id}/status`, { method: 'PATCH', body: { status: a.status, note: note || undefined } });
      toast.success(`Vehicle marked ${titleCase(a.status)}`);
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }
  async function toggleFeatured(on: boolean) {
    try {
      await api(`/admin/vehicles/${id}`, { method: 'PUT', body: { isFeatured: on } });
      toast.success(on ? 'Featured on website' : 'Removed from featured');
      reload();
    } catch (e) {
      reportError(e);
    }
  }

  const actions: StatusAction[] = [];
  if (v.status !== 'ACTIVE')
    actions.push({ status: 'ACTIVE', title: v.status === 'PENDING_APPROVAL' ? 'Approve vehicle' : 'Activate vehicle', message: 'The vehicle will be listed and bookable. Owner KYC must be approved and at least one photo uploaded.', label: v.status === 'PENDING_APPROVAL' ? 'Approve' : 'Activate', tone: 'primary' });
  if (v.status === 'PENDING_APPROVAL') actions.push({ status: 'REJECTED', title: 'Reject vehicle', message: 'The owner will be notified with your reason.', label: 'Reject', tone: 'danger', reason: true });
  if (v.status !== 'MAINTENANCE' && v.status !== 'PENDING_APPROVAL' && v.status !== 'REJECTED') actions.push({ status: 'MAINTENANCE', title: 'Mark under maintenance', message: 'The vehicle will be hidden from search until re-activated.', label: 'Maintenance', tone: 'primary', reason: true });
  if (v.status !== 'INACTIVE' && v.status !== 'PENDING_APPROVAL') actions.push({ status: 'INACTIVE', title: 'Deactivate vehicle', message: 'The vehicle will no longer be listed. Existing bookings are unaffected.', label: 'Deactivate', tone: 'danger', reason: true });
  const icon = { ACTIVE: <CheckCircle2 className="h-4 w-4" />, REJECTED: <XCircle className="h-4 w-4" />, MAINTENANCE: <Wrench className="h-4 w-4" />, INACTIVE: <Ban className="h-4 w-4" /> };

  return (
    <>
      <PageHeader
        back={<BackLink href="/admin/vehicles" label="Vehicles" />}
        title={v.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{v.registrationNumber}</span> · {v.model.make} {v.model.name} · {v.category.name} · {v.city.name} ·{' '}
            <Link href={`/admin/owners/${v.owner.id}`} className="font-medium text-navy-700 hover:underline">
              {v.owner.businessName}
            </Link>
            <EnumBadge value={v.status} tones={VEHICLE_STATUS_TONE} label={v.status === 'PENDING_APPROVAL' ? 'Pending approval' : undefined} />
            {Number(v.ratingCount) > 0 && (
              <Badge tone="gold">
                <Star className="h-3 w-3 fill-current" /> {Number(v.ratingAvg).toFixed(1)} ({v.ratingCount})
              </Badge>
            )}
          </span>
        }
        actions={
          canWrite && (
            <>
              <label className="flex h-11 items-center gap-2 rounded-xl border border-mist-200 bg-white px-3 text-sm font-medium text-slate-700">
                <Switch checked={v.isFeatured} onChange={toggleFeatured} label="Featured" /> Featured
              </label>
              {actions.map((a) => (
                <Button key={a.status} variant={a.status === 'ACTIVE' ? 'gold' : a.tone === 'danger' ? 'outline' : 'outline'} icon={icon[a.status]} onClick={() => setAction(a)}>
                  {a.label}
                </Button>
              ))}
            </>
          )
        }
      />
      {v.statusNote && <p className="mb-4 rounded-xl border border-mist-200 bg-white px-4 py-2 text-sm text-slate-600">Status note: {v.statusNote}</p>}
      {!canWrite && <ReadOnlyNotice module="vehicles" />}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'details', label: 'Details & pricing' },
          { value: 'photos', label: 'Photos', count: v.images.length },
          { value: 'documents', label: 'Documents', count: v.documents.length },
          { value: 'availability', label: 'Availability' },
          { value: 'bookings', label: 'Booking history', count: v.bookings.length },
        ]}
      />
      {tab === 'details' && (
        <VehicleForm
          key={JSON.stringify([v.id, (v as unknown as { updatedAt?: string }).updatedAt])}
          initial={v}
          disabled={!canWrite}
          onSubmit={async (payload) => {
            await api(`/admin/vehicles/${id}`, { method: 'PUT', body: payload });
            toast.success('Vehicle saved');
            reload();
          }}
        />
      )}
      {tab === 'photos' && <Photos v={v} canWrite={canWrite} onChanged={reload} />}
      {tab === 'documents' && (
        <Section title="Documents" subtitle="RC, insurance, fitness, permit and PUC uploaded by the owner">
          <DocumentList docs={v.documents} endpoint="/admin/vehicle-documents" canWrite={canWrite} onChanged={reload} />
        </Section>
      )}
      {tab === 'availability' && <Availability v={v} canWrite={canWrite} onChanged={reload} />}
      {tab === 'bookings' && (
        <DataTable
          rows={v.bookings}
          rowKey={(b) => b.id}
          rowHref={(b) => `/admin/bookings/${b.id}`}
          empty="No bookings for this vehicle yet"
          columns={[
            { key: 'no', header: 'Booking', render: (b) => <Link href={`/admin/bookings/${b.id}`} className="font-semibold text-navy-900 hover:underline">{b.bookingNumber}</Link> },
            { key: 'cu', header: 'Customer', render: (b) => b.customer.name ?? '—' },
            { key: 'pk', header: 'Pickup', render: (b) => fmtDateTime(b.pickupAt) },
            { key: 'rt', header: 'Return', render: (b) => fmtDateTime(b.returnAt) },
            { key: 'st', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
            { key: 'amt', header: 'Amount', align: 'right', render: (b) => inr(Number(b.finalAmount ?? b.totalAmount)) },
          ]}
        />
      )}
      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.title ?? ''}
        message={action?.message}
        confirmLabel={action?.label}
        tone={action?.tone ?? 'primary'}
        reason={action?.reason ? (action.status === 'REJECTED' ? 'Reason for rejection' : 'Note (optional)') : undefined}
        reasonRequired={action?.status === 'REJECTED'}
        onConfirm={(note) => changeStatus(action!, note)}
      />
    </>
  );
}

function Photos({ v, canWrite, onChanged }: { v: VehicleDetail; canWrite: boolean; onChanged: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<string | null>(null);

  async function upload(files: FileList) {
    const list = Array.from(files).slice(0, 10);
    if (list.some((f) => f.size > 8 * 1024 * 1024)) return toast.error('Each image must be under 8 MB');
    setBusy(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append('images', f));
      await api(`/admin/vehicles/${v.id}/images`, { method: 'POST', body: fd });
      toast.success(`${list.length} photo${list.length > 1 ? 's' : ''} uploaded`);
      onChanged();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }
  async function primary(imageId: string) {
    try {
      await api(`/admin/vehicles/${v.id}/images/${imageId}/primary`, { method: 'PATCH' });
      toast.success('Cover photo updated');
      onChanged();
    } catch (e) {
      reportError(e);
    }
  }
  async function remove(imageId: string) {
    try {
      await api(`/admin/vehicles/${v.id}/images/${imageId}`, { method: 'DELETE' });
      toast.success('Photo deleted');
      onChanged();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  return (
    <Section
      title="Photos"
      subtitle="JPG, PNG or WEBP, up to 10 at a time. The cover photo is shown in search results."
      action={
        canWrite && (
          <Button icon={busy ? <Spinner /> : <ImagePlus className="h-4 w-4" />} disabled={busy} onClick={() => ref.current?.click()}>
            Upload photos
          </Button>
        )
      }
    >
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
      {!v.images.length ? (
        <p className="rounded-xl border border-dashed border-mist-300 bg-mist-50 px-4 py-10 text-center text-sm text-slate-500">No photos yet. A vehicle needs at least one photo before it can go live.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {v.images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-mist-200 bg-mist-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt ?? v.title} className="aspect-[4/3] w-full object-cover" />
              {img.isPrimary && (
                <span className="absolute left-2 top-2">
                  <Badge tone="navy">Cover</Badge>
                </span>
              )}
              {canWrite && (
                <div className="flex gap-1 border-t border-mist-200 bg-white p-2">
                  <Button size="sm" variant="ghost" className="flex-1" disabled={img.isPrimary} onClick={() => primary(img.id)}>
                    Set as cover
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete photo" onClick={() => setDel(img.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete photo" message="This permanently removes the photo." confirmLabel="Delete" onConfirm={() => remove(del!)} />
    </Section>
  );
}

function Availability({ v, canWrite, onChanged }: { v: VehicleDetail; canWrite: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [type, setType] = useState<'MAINTENANCE' | 'OWNER_BLOCK'>('MAINTENANCE');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function openAdd() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    setStart(toLocalInput(new Date(now.getTime() + 3_600_000)));
    setEnd(toLocalInput(new Date(now.getTime() + 25 * 3_600_000)));
    setReason('');
    setErrors({});
    setOpen(true);
  }
  async function add() {
    if (!start || !end) return setErrors({ startAt: !start ? 'Required' : '', endAt: !end ? 'Required' : '' });
    if (end <= start) return setErrors({ endAt: 'End must be after start' });
    setBusy(true);
    try {
      await api(`/admin/vehicles/${v.id}/blocks`, { method: 'POST', body: { type, startAt: fromLocalInput(start), endAt: fromLocalInput(end), reason: reason.trim() || undefined } });
      toast.success('Block added');
      setOpen(false);
      onChanged();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(blockId: string) {
    try {
      await api(`/admin/vehicles/${v.id}/blocks/${blockId}`, { method: 'DELETE' });
      toast.success('Block removed');
      onChanged();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }
  const tone = { BOOKING: 'blue', MAINTENANCE: 'violet', OWNER_BLOCK: 'amber' } as const;

  return (
    <Section
      title="Upcoming availability blocks"
      subtitle="Bookings, maintenance windows and owner blocks from now onwards"
      action={
        canWrite && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
            Add block
          </Button>
        )
      }
      padded
    >
      <DataTable
        rows={v.availability}
        rowKey={(a) => a.id}
        empty="The vehicle is free — no upcoming blocks"
        columns={[
          { key: 't', header: 'Type', render: (a) => <Badge tone={tone[a.type]}>{titleCase(a.type)}</Badge> },
          { key: 's', header: 'From', render: (a) => fmtDateTime(a.startAt) },
          { key: 'e', header: 'Until', render: (a) => fmtDateTime(a.endAt) },
          {
            key: 'r',
            header: 'Details',
            render: (a) =>
              a.booking ? (
                <span className="flex items-center gap-2">
                  {a.bookingId ? (
                    <Link href={`/admin/bookings/${a.bookingId}`} className="font-semibold text-navy-800 hover:underline">
                      {a.booking.bookingNumber}
                    </Link>
                  ) : (
                    a.booking.bookingNumber
                  )}
                  <StatusBadge status={a.booking.status} />
                  {a.holdExpiresAt && <span className="text-xs text-amber-700">hold until {fmtDateTime(a.holdExpiresAt)}</span>}
                </span>
              ) : (
                a.reason ?? <span className="text-slate-400">—</span>
              ),
          },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (a) =>
              canWrite && a.type !== 'BOOKING' ? (
                <Button size="sm" variant="ghost" onClick={() => setDel(a.id)} aria-label="Remove block">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              ) : null,
          },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Block vehicle availability"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} loading={busy}>
              Add block
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="OWNER_BLOCK">Owner block (personal use / unavailable)</option>
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From (IST)" error={errors.startAt} required>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} invalid={!!errors.startAt} />
            </Field>
            <Field label="Until (IST)" error={errors.endAt} required>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} invalid={!!errors.endAt} />
            </Field>
          </div>
          <Field label="Reason" error={errors.reason}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Annual service" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Remove block" message="The vehicle will become bookable during this period." confirmLabel="Remove" onConfirm={() => remove(del!)} />
    </Section>
  );
}

export default function VehicleDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VehicleDetailInner />
    </Suspense>
  );
}
