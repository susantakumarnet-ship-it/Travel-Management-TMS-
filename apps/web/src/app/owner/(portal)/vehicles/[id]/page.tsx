'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CalendarOff, ImagePlus, Lock, Star, Trash2, Upload, Wrench } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, fromLocalInput, STATUS_LABEL, toLocalInput } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Skeleton, Tabs } from '@/components/ui/Display';
import { Field, Input, Select } from '@/components/ui/Field';
import { Banner, DocList, DocUploader, VehicleStatusBadge } from '@/components/partner/common';
import { VehicleForm, type VehicleSection } from '@/components/partner/VehicleForm';
import type { AvailabilityBlock, OwnerVehicle } from '@/components/partner/types';

type Tab = VehicleSection | 'photos' | 'documents' | 'availability';
const TABS: { value: Tab; label: string }[] = [
  { value: 'details', label: 'Details & specs' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'photos', label: 'Photos' },
  { value: 'documents', label: 'Documents' },
  { value: 'availability', label: 'Availability' },
];

function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const initialTab = (params.get('tab') as Tab) ?? 'details';
  const [tab, setTabState] = useState<Tab>(TABS.some((t) => t.value === initialTab) ? initialTab : 'details');
  const { data: v, error, loading, reload } = useApi<OwnerVehicle>(`/owner/vehicles/${id}`);

  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`/owner/vehicles/${id}?tab=${t}`, { scroll: false });
  };

  if (error && !v) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !v) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-10" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!v) return null;

  const counts: Partial<Record<Tab, number>> = { photos: v.images.length, documents: v.documents.length, availability: v.availability.length };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={
          <Link href="/owner/vehicles" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900">
            <ArrowLeft className="h-4 w-4" /> Vehicles
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {v.title} <VehicleStatusBadge status={v.status} />
          </span>
        }
        subtitle={
          <>
            <span className="font-mono">{v.registrationNumber}</span> · {v.model.make} {v.model.name} · {v.category.name} · {v.city.name}
          </>
        }
      />
      {v.status === 'PENDING_APPROVAL' && (
        <Banner tone="blue" title="Awaiting admin approval">
          {v.statusNote ?? 'Our team will review this vehicle shortly.'} Add photos and upload RC, insurance and permit to speed up approval.
        </Banner>
      )}
      {v.status === 'REJECTED' && (
        <Banner tone="red" title="This vehicle was not approved">
          {v.statusNote ?? 'Please review the details and documents, then contact support.'}
        </Banner>
      )}
      <Tabs tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} value={tab} onChange={setTab} />

      <div className={clsx(!(tab === 'details' || tab === 'pricing' || tab === 'compliance') && 'hidden')}>
        <VehicleForm
          vehicle={v}
          section={tab === 'details' || tab === 'pricing' || tab === 'compliance' ? tab : 'details'}
          onSaved={() => reload()}
          onSectionError={(s) => setTab(s)}
        />
      </div>
      {tab === 'photos' && <PhotosTab v={v} onChange={reload} />}
      {tab === 'documents' && <DocumentsTab v={v} onChange={reload} />}
      {tab === 'availability' && <AvailabilityTab v={v} onChange={reload} />}
    </div>
  );
}

// ───────────── Photos ─────────────
function PhotosTab({ v, onChange }: { v: OwnerVehicle; onChange: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  const remaining = 15 - v.images.length;

  function pick(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast.error(`${f.name}: only JPG, PNG or WEBP`);
        return false;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} is larger than 8 MB`);
        return false;
      }
      return true;
    });
    setFiles((cur) => [...cur, ...picked].slice(0, Math.min(10, remaining)));
  }

  async function upload() {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    setUploading(true);
    try {
      await api(`/owner/vehicles/${v.id}/images`, { method: 'POST', body: fd });
      toast.success(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`);
      setFiles([]);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function remove(imageId: string) {
    if (!confirm('Delete this photo?')) return;
    setDeleting(imageId);
    try {
      await api(`/owner/vehicles/${v.id}/images/${imageId}`, { method: 'DELETE' });
      toast.success('Photo deleted');
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Upload photos" subtitle={`Bright, high-resolution exterior and interior shots sell best. ${v.images.length}/15 used · up to 10 per upload.`} />
        {remaining <= 0 ? (
          <p className="text-sm text-slate-500">You have reached the maximum of 15 photos. Delete one to add another.</p>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mist-300 bg-mist-50 px-4 py-10 text-center transition hover:border-gold-400 hover:bg-white">
              <ImagePlus className="h-8 w-8 text-navy-400" />
              <span className="font-semibold text-navy-900">Choose photos</span>
              <span className="text-xs text-slate-500">JPG, PNG or WEBP · max 8 MB each</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
            </label>
            {previews.length > 0 && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {previews.map((p, i) => (
                    <div key={p.url} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-mist-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.f.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-600 shadow"
                        aria-label="Remove from upload"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setFiles([])}>
                    Clear
                  </Button>
                  <Button variant="gold" loading={uploading} onClick={upload} icon={<Upload className="h-4 w-4" />}>
                    Upload {files.length} photo{files.length > 1 ? 's' : ''}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
      <Card>
        <CardHeader title="Gallery" subtitle="The first photo is the cover shown in search results." />
        {v.images.length === 0 ? (
          <EmptyState title="No photos yet" description="Vehicles with photos get far more bookings." icon={<ImagePlus className="h-6 w-6" />} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {v.images.map((img) => (
              <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-mist-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? v.title} className="h-full w-full object-cover" loading="lazy" />
                {img.isPrimary && (
                  <span className="absolute left-2 top-2">
                    <Badge tone="gold">
                      <Star className="h-3 w-3" /> Cover
                    </Badge>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={deleting === img.id}
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-600 shadow hover:bg-white disabled:opacity-50"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────── Documents ─────────────
function DocumentsTab({ v, onChange }: { v: OwnerVehicle; onChange: () => void }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Upload vehicle document" subtitle="Uploading insurance, fitness, PUC or permit with an expiry date also updates the compliance dates." />
        <DocUploader endpoint={`/owner/vehicles/${v.id}/documents`} types={['RC', 'INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'OTHER']} withExpiry expiryRequiredFor={['INSURANCE', 'FITNESS', 'PERMIT', 'PUC']} onUploaded={onChange} />
      </Card>
      <Card>
        <CardHeader title="Uploaded documents" />
        <DocList docs={v.documents} />
      </Card>
    </div>
  );
}

// ───────────── Availability ─────────────
const BLOCK_STYLE: Record<AvailabilityBlock['type'], { label: string; cls: string; dot: string }> = {
  BOOKING: { label: 'Booking', cls: 'bg-sky-100 text-sky-900', dot: 'bg-sky-500' },
  MAINTENANCE: { label: 'Maintenance', cls: 'bg-violet-100 text-violet-900', dot: 'bg-violet-500' },
  OWNER_BLOCK: { label: 'Unavailable', cls: 'bg-slate-200 text-slate-800', dot: 'bg-slate-500' },
};

function istDayKey(d: Date) {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function AvailabilityTab({ v, onChange }: { v: OwnerVehicle; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const days = useMemo(() => {
    const out: { key: string; date: Date; blocks: AvailabilityBlock[] }[] = [];
    const start = new Date();
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getTime() + i * 86_400_000);
      const key = istDayKey(date);
      const dayStart = new Date(`${key}T00:00:00+05:30`).getTime();
      const dayEnd = dayStart + 86_400_000;
      out.push({ key, date, blocks: v.availability.filter((b) => new Date(b.startAt).getTime() < dayEnd && new Date(b.endAt).getTime() > dayStart) });
    }
    return out;
  }, [v.availability]);

  async function remove(b: AvailabilityBlock) {
    if (!confirm('Remove this block? The vehicle will be bookable for this period again.')) return;
    setRemoving(b.id);
    try {
      await api(`/owner/vehicles/${v.id}/blocks/${b.id}`, { method: 'DELETE' });
      toast.success('Block removed');
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Next 6 weeks"
          subtitle="Bookings and blocks on this vehicle (IST)."
          action={
            <Button variant="gold" size="sm" onClick={() => setOpen(true)} icon={<CalendarOff className="h-4 w-4" />}>
              Block dates
            </Button>
          }
        />
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {days.slice(0, 7).map((d) => (
            <span key={d.key} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {d.date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
            </span>
          ))}
          {days.map((d) => {
            const top = d.blocks[0];
            return (
              <div
                key={d.key}
                title={d.blocks.map((b) => `${BLOCK_STYLE[b.type].label}${b.booking ? ` #${b.booking.bookingNumber}` : ''}`).join(', ') || 'Available'}
                className={clsx('flex aspect-square flex-col items-center justify-center rounded-lg border text-xs sm:text-sm', top ? `${BLOCK_STYLE[top.type].cls} border-transparent font-semibold` : 'border-mist-200 bg-white text-slate-700')}
              >
                {d.date.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                {d.key.endsWith('-01') || d.key === days[0].key ? <span className="text-[9px] font-medium uppercase opacity-70">{d.date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}</span> : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
          {Object.values(BLOCK_STYLE).map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={clsx('h-2.5 w-2.5 rounded-full', s.dot)} /> {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-mist-300 bg-white" /> Available
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Upcoming bookings & blocks" />
        {v.availability.length === 0 ? (
          <EmptyState title="Fully available" description="No bookings or blocks coming up." icon={<CalendarOff className="h-6 w-6" />} />
        ) : (
          <ul className="divide-y divide-mist-100">
            {v.availability.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', BLOCK_STYLE[b.type].cls)}>
                  {b.type === 'MAINTENANCE' ? <Wrench className="h-4 w-4" /> : b.type === 'BOOKING' ? <Lock className="h-4 w-4" /> : <CalendarOff className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-900">
                    {BLOCK_STYLE[b.type].label}
                    {b.booking && <span className="ml-1 font-normal text-slate-500">#{b.booking.bookingNumber} · {STATUS_LABEL[b.booking.status]}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                    {b.reason && ` · ${b.reason}`}
                  </p>
                </div>
                {b.type !== 'BOOKING' && (
                  <Button variant="ghost" size="sm" className="text-red-600" loading={removing === b.id} onClick={() => remove(b)} icon={<Trash2 className="h-4 w-4" />}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <BlockModal open={open} onClose={() => setOpen(false)} vehicleId={v.id} onSaved={onChange} />
    </div>
  );
}

function BlockModal({ open, onClose, vehicleId, onSaved }: { open: boolean; onClose: () => void; vehicleId: string; onSaved: () => void }) {
  const [type, setType] = useState<'MAINTENANCE' | 'OWNER_BLOCK'>('MAINTENANCE');
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 86_400_000)));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!startAt || !endAt) return setErr('Choose start and end');
    if (new Date(fromLocalInput(endAt)) <= new Date(fromLocalInput(startAt))) return setErr('End must be after start');
    setSaving(true);
    try {
      await api(`/owner/vehicles/${vehicleId}/blocks`, { body: { type, startAt: fromLocalInput(startAt), endAt: fromLocalInput(endAt), reason: reason.trim() || undefined } });
      toast.success('Dates blocked');
      setReason('');
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Block dates"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" loading={saving} onClick={save}>
            Block period
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason type">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="MAINTENANCE">Maintenance / service</option>
            <option value="OWNER_BLOCK">Unavailable (personal use, other)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From (IST)" required>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Until (IST)" required>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Note" hint="Optional, only visible to you and support">
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual service" />
        </Field>
        {err && <ErrorState message={err} />}
      </div>
    </Modal>
  );
}

export default function VehicleDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <VehicleDetail />
    </Suspense>
  );
}
