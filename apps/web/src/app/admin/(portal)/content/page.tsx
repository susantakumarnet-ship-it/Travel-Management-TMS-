'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileText, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, inr } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { Cell, FormGrid, ReadOnlyNotice, Section } from '@/components/admin/bits';
import { useForm, usePerm } from '@/components/admin/hooks';
import { mediaUrl, reportError } from '@/components/admin/utils';

// ─────────────────────────── Pages ───────────────────────────

interface CmsPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  updatedAt: string;
}
const blankPage = { slug: '', title: '', body: '', metaTitle: '', metaDescription: '', isPublished: true };

function PagesTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<CmsPage[]>('/admin/pages');
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const { form, set, setForm, errors, setErrors } = useForm(blankPage);
  const [busy, setBusy] = useState(false);
  const isNew = selected === 'new';

  useEffect(() => {
    if (!data) return;
    if (selected == null && data.length) setSelected(data[0].slug);
  }, [data, selected]);
  useEffect(() => {
    if (selected === 'new') {
      setForm(blankPage);
      setErrors({});
      return;
    }
    const p = data?.find((x) => x.slug === selected);
    if (p) {
      setForm({ slug: p.slug, title: p.title, body: p.body, metaTitle: p.metaTitle ?? '', metaDescription: p.metaDescription ?? '', isPublished: p.isPublished });
      setErrors({});
    }
  }, [selected, data, setForm, setErrors]);

  const slugInvalid = isNew && form.slug !== '' && !/^[a-z0-9-]+$/.test(form.slug);

  async function save() {
    if (slugInvalid) return setErrors({ slug: 'Use lowercase letters, digits and hyphens only' });
    setBusy(true);
    try {
      const body = { ...form, metaTitle: form.metaTitle || null, metaDescription: form.metaDescription || null };
      await api(`/admin/pages/${encodeURIComponent(form.slug)}`, { method: 'PUT', body });
      toast.success('Page saved');
      await reload();
      setSelected(form.slug);
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
      <Card padded={false} className="h-fit overflow-hidden">
        <div className="flex items-center justify-between border-b border-mist-200 px-4 py-3">
          <span className="text-sm font-semibold text-navy-900">Pages</span>
          {canWrite && (
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setSelected('new')}>
              New
            </Button>
          )}
        </div>
        {loading && !data && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        )}
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p.slug)}
                className={clsx('flex w-full items-start gap-2 px-4 py-2 text-left text-sm transition', selected === p.slug ? 'bg-navy-50 text-navy-900' : 'text-slate-600 hover:bg-mist-50')}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-slate-400">/{p.slug}</span>
                </span>
                {!p.isPublished && <Badge className="ml-auto">Draft</Badge>}
              </button>
            </li>
          ))}
          {data && !data.length && <li className="px-4 py-6 text-center text-sm text-slate-500">No pages yet.</li>}
        </ul>
      </Card>

      {selected == null ? (
        <EmptyState title="Select a page to edit" />
      ) : (
        <Card>
          <fieldset disabled={!canWrite} className="space-y-4">
            <FormGrid>
              <Field label="Title" required error={errors.title}>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />
              </Field>
              <Field label="Slug" required error={errors.slug} hint={isNew ? 'URL path, e.g. terms or privacy-policy' : 'Slug cannot be changed'}>
                <Input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} readOnly={!isNew} invalid={!!errors.slug || slugInvalid} />
              </Field>
              <Field label="Meta title" error={errors.metaTitle}>
                <Input value={form.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} maxLength={160} />
              </Field>
              <Field label="Meta description" error={errors.metaDescription}>
                <Input value={form.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} maxLength={300} />
              </Field>
            </FormGrid>
            <Field label="Body" error={errors.body}>
              <MarkdownEditor value={form.body} onChange={(v) => set('body', v)} disabled={!canWrite} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist-100 pt-4">
              <Checkbox label="Published" checked={form.isPublished} onChange={(v) => set('isPublished', v)} disabled={!canWrite} />
              <div className="flex items-center gap-3">
                {!isNew && <span className="text-xs text-slate-400">Updated {fmtDateTime(data?.find((p) => p.slug === selected)?.updatedAt)}</span>}
                {canWrite && (
                  <Button onClick={save} loading={busy} disabled={!form.slug || !form.title}>
                    {isNew ? 'Create page' : 'Save page'}
                  </Button>
                )}
              </div>
            </div>
          </fieldset>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────── Blocks ───────────────────────────

interface Block {
  key: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

async function saveBlock(key: string, data: Record<string, unknown>) {
  await api(`/admin/blocks/${encodeURIComponent(key)}`, { method: 'PUT', body: { data } });
  toast.success('Content saved');
}

function HeroEditor({ block, canWrite, onSaved }: { block?: Block; canWrite: boolean; onSaved: () => void }) {
  const d = (block?.data ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({ badge: String(d.badge ?? ''), heading: String(d.heading ?? ''), subheading: String(d.subheading ?? ''), imageUrl: (d.imageUrl as string | null) ?? null });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await saveBlock('home.hero', { ...d, ...form, imageUrl: form.imageUrl || undefined });
      onSaved();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Homepage hero" subtitle="Headline area at the top of the homepage (block home.hero)" action={canWrite && <Button size="sm" onClick={save} loading={busy}>Save hero</Button>}>
      <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Field label="Badge" hint="Small label above the heading">
            <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
          </Field>
          <Field label="Heading">
            <Input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} />
          </Field>
          <Field label="Subheading">
            <Textarea value={form.subheading} onChange={(e) => setForm({ ...form, subheading: e.target.value })} rows={3} />
          </Field>
        </div>
        <Field label="Background image (optional)">
          <ImageUploader value={form.imageUrl} onChange={(k) => setForm({ ...form, imageUrl: k })} disabled={!canWrite} />
        </Field>
      </fieldset>
    </Section>
  );
}

function StatsEditor({ block, canWrite, onSaved }: { block?: Block; canWrite: boolean; onSaved: () => void }) {
  const initial = Array.isArray(block?.data?.items) ? (block!.data.items as { label: string; value: string }[]) : [];
  const [items, setItems] = useState(initial.map((i) => ({ label: String(i.label ?? ''), value: String(i.value ?? '') })));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await saveBlock('home.stats', { ...(block?.data ?? {}), items: items.filter((i) => i.label.trim() || i.value.trim()) });
      onSaved();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Homepage stats" subtitle="Trust figures shown under the hero (block home.stats)" action={canWrite && <Button size="sm" onClick={save} loading={busy}>Save stats</Button>}>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input className="max-w-[160px]" placeholder="25,000+" value={it.value} disabled={!canWrite} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} aria-label="Value" />
            <Input placeholder="Happy customers" value={it.label} disabled={!canWrite} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} aria-label="Label" />
            {canWrite && (
              <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className="rounded p-2 text-slate-400 hover:text-red-600" aria-label="Remove stat">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {canWrite && items.length < 8 && (
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setItems([...items, { label: '', value: '' }])}>
            Add stat
          </Button>
        )}
      </div>
    </Section>
  );
}

function JsonBlockEditor({ blockKey, block, canWrite, onSaved }: { blockKey: string; block?: Block; canWrite: boolean; onSaved: () => void }) {
  const [text, setText] = useState(JSON.stringify(block?.data ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return setErr('Invalid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return setErr('Top level must be an object { … }');
    setErr(null);
    setBusy(true);
    try {
      await saveBlock(blockKey, parsed as Record<string, unknown>);
      onSaved();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title={<span className="font-mono text-sm">{blockKey}</span>} subtitle={block ? `Updated ${fmtDateTime(block.updatedAt)}` : 'Not set yet'} action={canWrite && <Button size="sm" variant="outline" onClick={save} loading={busy}>Save</Button>}>
      <Textarea className="font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={!canWrite} invalid={!!err} />
      {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
    </Section>
  );
}

function BlocksTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<Block[]>('/admin/blocks');
  const [newKey, setNewKey] = useState('');
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-80" />;
  const byKey = Object.fromEntries((data ?? []).map((b) => [b.key, b]));
  const others = Array.from(new Set(['home.why', 'footer', ...(data ?? []).map((b) => b.key), ...extraKeys])).filter((k) => k !== 'home.hero' && k !== 'home.stats');
  const stamp = (data ?? []).map((b) => b.updatedAt).join();
  return (
    <div className="space-y-6">
      <HeroEditor key={`hero-${stamp}`} block={byKey['home.hero']} canWrite={canWrite} onSaved={reload} />
      <StatsEditor key={`stats-${stamp}`} block={byKey['home.stats']} canWrite={canWrite} onSaved={reload} />
      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Other blocks</h3>
        <p className="mb-3 text-sm text-slate-500">Advanced: edit raw JSON. The website reads home.hero, home.why, home.stats and footer.</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {others.map((k) => (
            <JsonBlockEditor key={`${k}-${stamp}`} blockKey={k} block={byKey[k]} canWrite={canWrite} onSaved={reload} />
          ))}
        </div>
        {canWrite && (
          <div className="mt-4 flex max-w-md gap-2">
            <Input placeholder="new.block.key" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} />
            <Button
              variant="outline"
              disabled={!/^[a-z0-9._-]{2,80}$/.test(newKey) || others.includes(newKey)}
              onClick={() => {
                setExtraKeys([...extraKeys, newKey]);
                setNewKey('');
              }}
            >
              Add block
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Testimonials ───────────────────────────

interface Testimonial {
  id: string;
  name: string;
  location: string | null;
  occasion: string | null;
  rating: number;
  quote: string;
  avatarUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

function TestimonialModal({ item, onClose, onSaved, canWrite }: { item: Testimonial | null; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const { form, set, errors, setErrors } = useForm({
    name: item?.name ?? '',
    location: item?.location ?? '',
    occasion: item?.occasion ?? '',
    rating: String(item?.rating ?? 5),
    quote: item?.quote ?? '',
    avatarUrl: item?.avatarUrl ?? (null as string | null),
    isActive: item?.isActive ?? true,
    sortOrder: String(item?.sortOrder ?? 0),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, location: form.location || null, occasion: form.occasion || null, rating: Number(form.rating), sortOrder: Number(form.sortOrder || 0) };
      if (item) await api(`/admin/testimonials/${item.id}`, { method: 'PUT', body });
      else await api('/admin/testimonials', { method: 'POST', body });
      toast.success('Testimonial saved');
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
      open
      onClose={onClose}
      size="lg"
      title={item ? 'Edit testimonial' : 'New testimonial'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {canWrite && (
            <Button onClick={save} loading={busy} disabled={!form.name || !form.quote}>
              Save
            </Button>
          )}
        </>
      }
    >
      <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
        <div className="space-y-4">
          <FormGrid>
            <Field label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
            </Field>
            <Field label="Location" error={errors.location}>
              <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Cuttack" />
            </Field>
            <Field label="Occasion" error={errors.occasion}>
              <Input value={form.occasion} onChange={(e) => set('occasion', e.target.value)} placeholder="Wedding" />
            </Field>
            <Field label="Rating" error={errors.rating}>
              <Select value={form.rating} onChange={(e) => set('rating', e.target.value)}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} star{n > 1 ? 's' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="Quote" required error={errors.quote}>
            <Textarea value={form.quote} onChange={(e) => set('quote', e.target.value)} maxLength={1000} rows={4} invalid={!!errors.quote} />
          </Field>
          <div className="flex flex-wrap items-center gap-6">
            <Field label="Sort order" error={errors.sortOrder}>
              <Input type="number" className="w-28" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </Field>
            <Checkbox label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} disabled={!canWrite} />
          </div>
        </div>
        <Field label="Photo">
          <ImageUploader value={form.avatarUrl} onChange={(k) => set('avatarUrl', k)} aspect="aspect-square" disabled={!canWrite} label="Upload" />
        </Field>
      </fieldset>
    </Modal>
  );
}

function TestimonialsTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<Testimonial[]>('/admin/testimonials');
  const [editing, setEditing] = useState<Testimonial | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Testimonial | null>(null);
  const cols: Column<Testimonial>[] = [
    {
      key: 'who',
      header: 'Customer',
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-mist-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.avatarUrl && <img src={mediaUrl(t.avatarUrl)!} alt="" className="h-full w-full object-cover" />}
          </div>
          <Cell primary={t.name} secondary={[t.occasion, t.location].filter(Boolean).join(' · ')} />
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (t) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Star className="h-4 w-4 fill-gold-500 text-gold-500" /> {t.rating}
        </span>
      ),
    },
    { key: 'quote', header: 'Quote', className: 'min-w-[260px]', render: (t) => <p className="line-clamp-2 text-sm text-slate-600">{t.quote}</p> },
    { key: 'order', header: 'Order', align: 'right', render: (t) => t.sortOrder },
    { key: 'active', header: 'Status', render: (t) => (t.isActive ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>) },
    {
      key: 'a',
      header: '',
      align: 'right',
      render: (t) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(t)}>
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(t)} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New testimonial
          </Button>
        </div>
      )}
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(t) => t.id} onRowClick={(t) => setEditing(t)} empty="No testimonials yet" />
      {editing && <TestimonialModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} canWrite={canWrite} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete testimonial"
        message={`Permanently delete the testimonial from ${deleting?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api(`/admin/testimonials/${deleting!.id}`, { method: 'DELETE' });
            toast.success('Testimonial deleted');
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

// ─────────────────────────── Destinations ───────────────────────────

interface Destination {
  id: string;
  name: string;
  state: string;
  tagline: string | null;
  imageUrl: string | null;
  distanceKm: number | null;
  startingFare: number | string | null;
  isActive: boolean;
  sortOrder: number;
}

function DestinationModal({ item, onClose, onSaved, canWrite }: { item: Destination | null; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const { form, set, errors, setErrors } = useForm({
    name: item?.name ?? '',
    state: item?.state ?? 'Odisha',
    tagline: item?.tagline ?? '',
    imageUrl: item?.imageUrl ?? (null as string | null),
    distanceKm: item?.distanceKm != null ? String(item.distanceKm) : '',
    startingFare: item?.startingFare != null ? String(Number(item.startingFare)) : '',
    isActive: item?.isActive ?? true,
    sortOrder: String(item?.sortOrder ?? 0),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = {
        ...form,
        tagline: form.tagline || null,
        distanceKm: form.distanceKm === '' ? null : Number(form.distanceKm),
        startingFare: form.startingFare === '' ? null : Number(form.startingFare),
        sortOrder: Number(form.sortOrder || 0),
      };
      if (item) await api(`/admin/destinations/${item.id}`, { method: 'PUT', body });
      else await api('/admin/destinations', { method: 'POST', body });
      toast.success('Destination saved');
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
      open
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.name}` : 'New destination'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {canWrite && (
            <Button onClick={save} loading={busy} disabled={!form.name || !form.state}>
              Save
            </Button>
          )}
        </>
      }
    >
      <fieldset disabled={!canWrite} className="space-y-4">
        <ImageUploader value={form.imageUrl} onChange={(k) => set('imageUrl', k)} disabled={!canWrite} />
        <FormGrid>
          <Field label="Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field label="State" required error={errors.state}>
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} invalid={!!errors.state} />
          </Field>
          <Field label="Tagline" error={errors.tagline} className="sm:col-span-2">
            <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
          </Field>
          <Field label="Distance from Bhubaneswar (km)" error={errors.distanceKm}>
            <Input type="number" min={0} value={form.distanceKm} onChange={(e) => set('distanceKm', e.target.value)} />
          </Field>
          <Field label="Starting fare (₹)" error={errors.startingFare}>
            <Input type="number" min={0} value={form.startingFare} onChange={(e) => set('startingFare', e.target.value)} />
          </Field>
          <Field label="Sort order" error={errors.sortOrder}>
            <Input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} disabled={!canWrite} />
          </div>
        </FormGrid>
      </fieldset>
    </Modal>
  );
}

function DestinationsTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<Destination[]>('/admin/destinations');
  const [editing, setEditing] = useState<Destination | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Destination | null>(null);
  const cols: Column<Destination>[] = [
    {
      key: 'img',
      header: '',
      render: (d) => (
        <div className="h-12 w-20 overflow-hidden rounded-lg bg-mist-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.imageUrl && <img src={mediaUrl(d.imageUrl)!} alt="" className="h-full w-full object-cover" />}
        </div>
      ),
    },
    { key: 'name', header: 'Destination', render: (d) => <Cell primary={d.name} secondary={d.tagline ?? d.state} /> },
    { key: 'state', header: 'State', render: (d) => d.state },
    { key: 'dist', header: 'Distance', align: 'right', render: (d) => (d.distanceKm != null ? `${d.distanceKm} km` : '—') },
    { key: 'fare', header: 'From', align: 'right', render: (d) => (d.startingFare != null ? inr(Number(d.startingFare)) : '—') },
    { key: 'order', header: 'Order', align: 'right', render: (d) => d.sortOrder },
    { key: 'active', header: 'Status', render: (d) => (d.isActive ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>) },
    {
      key: 'a',
      header: '',
      align: 'right',
      render: (d) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(d)}>
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(d)} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New destination
          </Button>
        </div>
      )}
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(d) => d.id} onRowClick={(d) => setEditing(d)} empty="No destinations yet" />
      {editing && <DestinationModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} canWrite={canWrite} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete destination"
        message={`Permanently delete ${deleting?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api(`/admin/destinations/${deleting!.id}`, { method: 'DELETE' });
            toast.success('Destination deleted');
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

// ─────────────────────────── Page ───────────────────────────

type TabKey = 'pages' | 'blocks' | 'testimonials' | 'destinations';

export default function ContentPage() {
  const { canWrite } = usePerm('content');
  const [tab, setTab] = useState<TabKey>('pages');
  return (
    <>
      <PageHeader title="Website content" subtitle="Static pages, homepage blocks, testimonials and destinations" />
      {!canWrite && <ReadOnlyNotice module="website content" />}
      <Tabs
        tabs={[
          { value: 'pages', label: 'Pages' },
          { value: 'blocks', label: 'Homepage blocks' },
          { value: 'testimonials', label: 'Testimonials' },
          { value: 'destinations', label: 'Destinations' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pages' && <PagesTab canWrite={canWrite} />}
      {tab === 'blocks' && <BlocksTab canWrite={canWrite} />}
      {tab === 'testimonials' && <TestimonialsTab canWrite={canWrite} />}
      {tab === 'destinations' && <DestinationsTab canWrite={canWrite} />}
    </>
  );
}
