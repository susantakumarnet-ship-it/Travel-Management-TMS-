'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { inr, titleCase } from '@/lib/format';
import { Badge, Modal, PageHeader, Tabs } from '@/components/ui/Display';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ListEditor } from '@/components/admin/ListEditor';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { Cell, FormGrid, ReadOnlyNotice, Switch } from '@/components/admin/bits';
import { useForm, usePerm } from '@/components/admin/hooks';
import { mediaUrl, reportError } from '@/components/admin/utils';

interface TravelPkg {
  id: string;
  title: string;
  type: string;
  destination: string;
  durationDays: number;
  durationNights: number;
  basePrice: number | string;
  imageUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  recommendedCategory: { name: string } | null;
  _count: { bookings: number };
}

interface WeddingPkg {
  id: string;
  name: string;
  tier: 'SILVER' | 'GOLD' | 'PREMIUM' | 'LUXURY';
  tagline: string | null;
  description: string | null;
  basePrice: number | string;
  includedHours: number;
  includedKm: number;
  vehicleCount: number;
  extraHourRate: number | string;
  extraKmRate: number | string;
  decorationIncluded: boolean;
  inclusions: string[];
  vehicleHighlights: string[];
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { requests: number };
}

const TIER_TONE = { SILVER: 'gray', GOLD: 'gold', PREMIUM: 'indigo', LUXURY: 'navy' } as const;

function TravelTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload, setData } = useApi<TravelPkg[]>('/admin/travel-packages');
  const [deleting, setDeleting] = useState<TravelPkg | null>(null);

  async function togglePublish(p: TravelPkg, v: boolean) {
    setData((d) => d?.map((x) => (x.id === p.id ? { ...x, isPublished: v } : x)) ?? d);
    try {
      await api(`/admin/travel-packages/${p.id}/publish`, { method: 'PATCH', body: { isPublished: v } });
      toast.success(v ? 'Package published' : 'Package unpublished');
    } catch (e) {
      reportError(e);
      reload();
    }
  }

  const cols: Column<TravelPkg>[] = [
    {
      key: 'img',
      header: '',
      render: (p) => (
        <div className="h-12 w-20 overflow-hidden rounded-lg bg-mist-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.imageUrl && <img src={mediaUrl(p.imageUrl)!} alt="" className="h-full w-full object-cover" />}
        </div>
      ),
    },
    { key: 'title', header: 'Package', render: (p) => <Cell primary={p.title} secondary={titleCase(p.type)} href={`/admin/packages/travel/${p.id}`} /> },
    { key: 'dest', header: 'Destination', render: (p) => p.destination },
    { key: 'dur', header: 'Duration', render: (p) => `${p.durationDays}D / ${p.durationNights}N` },
    { key: 'price', header: 'Base price', align: 'right', render: (p) => inr(Number(p.basePrice)) },
    { key: 'bookings', header: 'Bookings', align: 'right', render: (p) => p._count.bookings },
    { key: 'feat', header: 'Featured', render: (p) => (p.isFeatured ? <Badge tone="gold">Featured</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'pub', header: 'Published', render: (p) => <Switch checked={p.isPublished} disabled={!canWrite} onChange={(v) => togglePublish(p, v)} label="Published" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <ButtonLink href={`/admin/packages/travel/${p.id}`} size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />}>
            {canWrite ? 'Edit' : 'View'}
          </ButtonLink>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite && (
          <ButtonLink href="/admin/packages/travel/new" icon={<Plus className="h-4 w-4" />}>
            New travel package
          </ButtonLink>
        )}
      </div>
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(p) => p.id} rowHref={(p) => `/admin/packages/travel/${p.id}`} empty="No travel packages yet" />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete travel package"
        message={`Delete "${deleting?.title}"? If it has bookings it will be unpublished instead.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            const r = await api<{ ok: boolean; unpublished?: boolean }>(`/admin/travel-packages/${deleting!.id}`, { method: 'DELETE' });
            toast.success(r.unpublished ? 'Package has bookings, so it was unpublished' : 'Package deleted');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
    </>
  );
}

const emptyWedding = {
  name: '',
  tier: 'GOLD' as WeddingPkg['tier'],
  tagline: '',
  description: '',
  basePrice: '',
  includedHours: '8',
  includedKm: '80',
  vehicleCount: '1',
  extraHourRate: '0',
  extraKmRate: '0',
  decorationIncluded: true,
  inclusions: [] as string[],
  vehicleHighlights: [] as string[],
  imageUrl: null as string | null,
  isActive: true,
  sortOrder: '0',
};

function WeddingModal({ pkg, open, onClose, onSaved, canWrite }: { pkg: WeddingPkg | null; open: boolean; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const init = pkg
    ? {
        name: pkg.name,
        tier: pkg.tier,
        tagline: pkg.tagline ?? '',
        description: pkg.description ?? '',
        basePrice: String(Number(pkg.basePrice)),
        includedHours: String(pkg.includedHours),
        includedKm: String(pkg.includedKm),
        vehicleCount: String(pkg.vehicleCount),
        extraHourRate: String(Number(pkg.extraHourRate)),
        extraKmRate: String(Number(pkg.extraKmRate)),
        decorationIncluded: pkg.decorationIncluded,
        inclusions: pkg.inclusions,
        vehicleHighlights: pkg.vehicleHighlights,
        imageUrl: pkg.imageUrl,
        isActive: pkg.isActive,
        sortOrder: String(pkg.sortOrder),
      }
    : emptyWedding;
  const { form, set, errors, setErrors } = useForm(init);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = {
        ...form,
        tagline: form.tagline || null,
        description: form.description || null,
        basePrice: Number(form.basePrice),
        includedHours: Number(form.includedHours),
        includedKm: Number(form.includedKm),
        vehicleCount: Number(form.vehicleCount),
        extraHourRate: Number(form.extraHourRate || 0),
        extraKmRate: Number(form.extraKmRate || 0),
        sortOrder: Number(form.sortOrder || 0),
        inclusions: form.inclusions.filter(Boolean),
        vehicleHighlights: form.vehicleHighlights.filter(Boolean),
      };
      if (pkg) await api(`/admin/wedding-packages/${pkg.id}`, { method: 'PUT', body });
      else await api('/admin/wedding-packages', { method: 'POST', body });
      toast.success(pkg ? 'Package updated' : 'Package created');
      onSaved();
      onClose();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={pkg ? `Edit ${pkg.name}` : 'New wedding package'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {canWrite && (
            <Button onClick={save} loading={busy} disabled={!form.name || form.basePrice === ''}>
              Save package
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <FormGrid>
            <Field label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
            </Field>
            <Field label="Tier" error={errors.tier}>
              <Select value={form.tier} onChange={(e) => set('tier', e.target.value as WeddingPkg['tier'])}>
                {(['SILVER', 'GOLD', 'PREMIUM', 'LUXURY'] as const).map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="Tagline" error={errors.tagline}>
            <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
          </Field>
          <Field label="Description" error={errors.description}>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </Field>
          <FormGrid cols={3}>
            <Field label="Base price (₹)" required error={errors.basePrice}>
              <Input type="number" min={0} value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} invalid={!!errors.basePrice} />
            </Field>
            <Field label="Included hours" error={errors.includedHours}>
              <Input type="number" min={1} max={48} value={form.includedHours} onChange={(e) => set('includedHours', e.target.value)} invalid={!!errors.includedHours} />
            </Field>
            <Field label="Included km" error={errors.includedKm}>
              <Input type="number" min={0} value={form.includedKm} onChange={(e) => set('includedKm', e.target.value)} invalid={!!errors.includedKm} />
            </Field>
            <Field label="Vehicles" error={errors.vehicleCount}>
              <Input type="number" min={1} value={form.vehicleCount} onChange={(e) => set('vehicleCount', e.target.value)} invalid={!!errors.vehicleCount} />
            </Field>
            <Field label="Extra hour rate (₹)" error={errors.extraHourRate}>
              <Input type="number" min={0} value={form.extraHourRate} onChange={(e) => set('extraHourRate', e.target.value)} />
            </Field>
            <Field label="Extra km rate (₹)" error={errors.extraKmRate}>
              <Input type="number" min={0} value={form.extraKmRate} onChange={(e) => set('extraKmRate', e.target.value)} />
            </Field>
          </FormGrid>
          <Field label="Inclusions" error={errors.inclusions}>
            <ListEditor value={form.inclusions} onChange={(v) => set('inclusions', v)} disabled={!canWrite} placeholder="e.g. Fresh flower decoration" />
          </Field>
          <Field label="Vehicle highlights" error={errors.vehicleHighlights}>
            <ListEditor value={form.vehicleHighlights} onChange={(v) => set('vehicleHighlights', v)} max={20} disabled={!canWrite} placeholder="e.g. Mercedes E-Class for the couple" />
          </Field>
        </div>
        <div className="space-y-4">
          <Field label="Cover image">
            <ImageUploader value={form.imageUrl} onChange={(k) => set('imageUrl', k)} disabled={!canWrite} aspect="aspect-[4/3]" />
          </Field>
          <Field label="Sort order" error={errors.sortOrder}>
            <Input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
          <Checkbox label="Decoration included" checked={form.decorationIncluded} onChange={(v) => set('decorationIncluded', v)} disabled={!canWrite} />
          <Checkbox label="Active (shown on website)" checked={form.isActive} onChange={(v) => set('isActive', v)} disabled={!canWrite} />
        </div>
      </div>
    </Modal>
  );
}

function WeddingTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<WeddingPkg[]>('/admin/wedding-packages');
  const [editing, setEditing] = useState<WeddingPkg | null>(null);
  const [open, setOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<WeddingPkg | null>(null);

  const cols: Column<WeddingPkg>[] = [
    {
      key: 'img',
      header: '',
      render: (p) => (
        <div className="h-12 w-20 overflow-hidden rounded-lg bg-mist-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.imageUrl && <img src={mediaUrl(p.imageUrl)!} alt="" className="h-full w-full object-cover" />}
        </div>
      ),
    },
    { key: 'name', header: 'Package', render: (p) => <Cell primary={p.name} secondary={p.tagline} /> },
    { key: 'tier', header: 'Tier', render: (p) => <Badge tone={TIER_TONE[p.tier]}>{titleCase(p.tier)}</Badge> },
    { key: 'price', header: 'Base price', align: 'right', render: (p) => inr(Number(p.basePrice)) },
    { key: 'inc', header: 'Includes', render: (p) => `${p.vehicleCount} car${p.vehicleCount > 1 ? 's' : ''} · ${p.includedHours} h · ${p.includedKm} km` },
    { key: 'req', header: 'Requests', align: 'right', render: (p) => p._count.requests },
    { key: 'status', header: 'Status', render: (p) => (p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => {
              setEditing(p);
              setOpen(true);
            }}
          >
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {canWrite && p.isActive && (
            <Button size="sm" variant="ghost" onClick={() => setDeactivating(p)} aria-label="Deactivate">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite && (
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New wedding package
          </Button>
        )}
      </div>
      <DataTable
        columns={cols}
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(p) => p.id}
        onRowClick={(p) => {
          setEditing(p);
          setOpen(true);
        }}
        empty="No wedding packages yet"
      />
      {open && <WeddingModal key={editing?.id ?? 'new'} pkg={editing} open={open} onClose={() => setOpen(false)} onSaved={reload} canWrite={canWrite} />}
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        title="Deactivate wedding package"
        message={`"${deactivating?.name}" will be hidden from the website. Existing requests are unaffected.`}
        confirmLabel="Deactivate"
        onConfirm={async () => {
          try {
            await api(`/admin/wedding-packages/${deactivating!.id}`, { method: 'DELETE' });
            toast.success('Package deactivated');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
    </>
  );
}

export default function PackagesPage() {
  const { canWrite } = usePerm('packages');
  const [tab, setTab] = useState<'travel' | 'wedding'>('travel');
  return (
    <>
      <PageHeader title="Packages" subtitle="Travel tours and wedding car packages shown on the website" />
      {!canWrite && <ReadOnlyNotice module="packages" />}
      <Tabs
        tabs={[
          { value: 'travel', label: 'Travel packages' },
          { value: 'wedding', label: 'Wedding packages' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'travel' ? <TravelTab canWrite={canWrite} /> : <WeddingTab canWrite={canWrite} />}
      <p className="mt-6 text-xs text-slate-400">
        Tip: travel packages appear under <Link href="/packages" className="underline">/packages</Link> once published.
      </p>
    </>
  );
}
