'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { FUEL_LABEL, titleCase } from '@/lib/format';
import { Badge, Modal, PageHeader, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DataTable } from '@/components/admin/DataTable';
import { FilterBar, FilterSelect } from '@/components/admin/FilterBar';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { FormGrid, ReadOnlyNotice } from '@/components/admin/bits';
import { useForm, usePerm } from '@/components/admin/hooks';
import { FUEL_TYPES, TRANSMISSIONS, mediaUrl, reportError } from '@/components/admin/utils';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isWedding: boolean;
  commissionRate: number | null;
  _count: { vehicles: number; models: number };
}
interface ModelRow {
  id: string;
  categoryId: string;
  make: string;
  name: string;
  seats: number;
  luggageBags: number;
  fuelType: string;
  transmission: string;
  isActive: boolean;
  category: { name: string };
  _count: { vehicles: number };
}
interface CityRow {
  id: string;
  name: string;
  state: string;
  slug: string;
  isActive: boolean;
  _count: { vehicles: number; drivers: number };
}

type Tab = 'categories' | 'models' | 'cities';

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>('categories');
  const { canWrite } = usePerm('categories');
  return (
    <>
      <PageHeader title="Categories, models & cities" subtitle="The catalogue owners pick from when listing vehicles" />
      {!canWrite && <ReadOnlyNotice module="the catalogue" />}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'categories', label: 'Categories' },
          { value: 'models', label: 'Models' },
          { value: 'cities', label: 'Cities' },
        ]}
      />
      {tab === 'categories' && <Categories canWrite={canWrite} />}
      {tab === 'models' && <Models canWrite={canWrite} />}
      {tab === 'cities' && <Cities canWrite={canWrite} />}
    </>
  );
}

// ───────────── Categories ─────────────

const emptyCat = { name: '', slug: '', description: '', icon: '', sortOrder: '0', isActive: true, isWedding: false, commissionRate: '' };

function Categories({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<CategoryRow[]>('/admin/categories');
  const [editing, setEditing] = useState<CategoryRow | 'new' | null>(null);
  const [del, setDel] = useState<CategoryRow | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const f = useForm(emptyCat);
  const [busy, setBusy] = useState(false);

  function open(c: CategoryRow | 'new') {
    f.reset(
      c === 'new'
        ? emptyCat
        : { name: c.name, slug: c.slug, description: c.description ?? '', icon: c.icon ?? '', sortOrder: String(c.sortOrder), isActive: c.isActive, isWedding: c.isWedding, commissionRate: c.commissionRate == null ? '' : String(c.commissionRate) },
    );
    setEditing(c);
  }
  async function save() {
    const v = f.form;
    const body = {
      name: v.name.trim(),
      slug: v.slug.trim() || undefined,
      description: v.description.trim() || null,
      icon: v.icon.trim() || null,
      sortOrder: Number(v.sortOrder || 0),
      isActive: v.isActive,
      isWedding: v.isWedding,
      commissionRate: v.commissionRate === '' ? null : Number(v.commissionRate),
    };
    setBusy(true);
    try {
      if (editing === 'new') await api('/admin/categories', { method: 'POST', body });
      else await api(`/admin/categories/${(editing as CategoryRow).id}`, { method: 'PUT', body });
      toast.success('Category saved');
      setEditing(null);
      reload();
    } catch (e) {
      f.setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }
  async function uploadImage(file: File) {
    if (!uploadFor) return;
    try {
      const fd = new FormData();
      fd.append('image', file);
      await api(`/admin/categories/${uploadFor}/image`, { method: 'POST', body: fd });
      toast.success('Image updated');
      reload();
    } catch (e) {
      reportError(e);
    } finally {
      setUploadFor(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function remove(c: CategoryRow) {
    try {
      await api(`/admin/categories/${c.id}`, { method: 'DELETE' });
      toast.success('Category deleted');
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  return (
    <>
      <FilterBar
        actions={
          canWrite && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
              New category
            </Button>
          )
        }
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty="No categories yet"
        columns={[
          {
            key: 'img',
            header: '',
            render: (r) => {
              const src = mediaUrl(r.imageUrl);
              return (
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => {
                    setUploadFor(r.id);
                    fileRef.current?.click();
                  }}
                  className="flex h-11 w-16 items-center justify-center overflow-hidden rounded-lg border border-mist-200 bg-mist-50 text-slate-400 hover:text-navy-700"
                  aria-label="Change image"
                  title={canWrite ? 'Upload image' : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4" />}
                </button>
              );
            },
          },
          {
            key: 'name',
            header: 'Category',
            render: (r) => (
              <div>
                <p className="font-medium text-navy-900">
                  {r.name} {r.isWedding && <Badge tone="gold">Wedding</Badge>}
                </p>
                <p className="text-xs text-slate-500">/{r.slug}</p>
              </div>
            ),
          },
          { key: 'comm', header: 'Commission', align: 'right', render: (r) => (r.commissionRate == null ? <span className="text-slate-400">Default</span> : `${Number(r.commissionRate)}%`) },
          { key: 'veh', header: 'Vehicles', align: 'right', render: (r) => r._count.vehicles },
          { key: 'mod', header: 'Models', align: 'right', render: (r) => r._count.models },
          { key: 'sort', header: 'Order', align: 'right', render: (r) => r.sortOrder },
          { key: 'st', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (r) =>
              canWrite && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(r)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(r)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New category' : 'Edit category'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Name" required error={f.errors.name}>
              <Input value={f.form.name} onChange={(e) => f.set('name', e.target.value)} invalid={!!f.errors.name} />
            </Field>
            <Field label="Slug" error={f.errors.slug} hint="Leave blank to generate from name">
              <Input value={f.form.slug} onChange={(e) => f.set('slug', e.target.value)} />
            </Field>
            <Field label="Icon" error={f.errors.icon} hint="Lucide icon name (optional)">
              <Input value={f.form.icon} onChange={(e) => f.set('icon', e.target.value)} />
            </Field>
            <Field label="Sort order" error={f.errors.sortOrder}>
              <Input type="number" value={f.form.sortOrder} onChange={(e) => f.set('sortOrder', e.target.value)} />
            </Field>
            <Field label="Commission %" error={f.errors.commissionRate} hint="Blank = platform default">
              <Input type="number" step="0.01" min={0} max={100} value={f.form.commissionRate} onChange={(e) => f.set('commissionRate', e.target.value)} invalid={!!f.errors.commissionRate} />
            </Field>
          </FormGrid>
          <Field label="Description" error={f.errors.description}>
            <Textarea rows={3} value={f.form.description} onChange={(e) => f.set('description', e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <Checkbox label="Active" checked={f.form.isActive} onChange={(v) => f.set('isActive', v)} />
            <Checkbox label="Wedding category" checked={f.form.isWedding} onChange={(v) => f.set('isWedding', v)} />
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete category" message={`Delete “${del?.name}”? Categories with vehicles can't be deleted — deactivate them instead.`} confirmLabel="Delete" onConfirm={() => remove(del!)} />
    </>
  );
}

// ───────────── Models ─────────────

const emptyModel = { categoryId: '', make: '', name: '', seats: '4', luggageBags: '2', fuelType: 'PETROL', transmission: 'MANUAL', isActive: true };

function Models({ canWrite }: { canWrite: boolean }) {
  const [categoryId, setCategoryId] = useState('');
  const cats = useApi<CategoryRow[]>('/admin/categories');
  const { data, loading, error, reload } = useApi<ModelRow[]>('/admin/models', { query: { categoryId } });
  const [editing, setEditing] = useState<ModelRow | 'new' | null>(null);
  const [del, setDel] = useState<ModelRow | null>(null);
  const f = useForm(emptyModel);
  const [busy, setBusy] = useState(false);

  function open(m: ModelRow | 'new') {
    f.reset(m === 'new' ? { ...emptyModel, categoryId } : { categoryId: m.categoryId, make: m.make, name: m.name, seats: String(m.seats), luggageBags: String(m.luggageBags), fuelType: m.fuelType, transmission: m.transmission, isActive: m.isActive });
    setEditing(m);
  }
  async function save() {
    const v = f.form;
    const body = { categoryId: v.categoryId, make: v.make.trim(), name: v.name.trim(), seats: Number(v.seats), luggageBags: Number(v.luggageBags || 0), fuelType: v.fuelType, transmission: v.transmission, isActive: v.isActive };
    setBusy(true);
    try {
      if (editing === 'new') await api('/admin/models', { method: 'POST', body });
      else await api(`/admin/models/${(editing as ModelRow).id}`, { method: 'PUT', body });
      toast.success('Model saved');
      setEditing(null);
      reload();
    } catch (e) {
      f.setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(m: ModelRow) {
    try {
      await api(`/admin/models/${m.id}`, { method: 'DELETE' });
      toast.success('Model deleted');
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  return (
    <>
      <FilterBar
        actions={
          canWrite && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
              New model
            </Button>
          )
        }
      >
        <FilterSelect value={categoryId} onChange={setCategoryId} placeholder="All categories" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      </FilterBar>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty="No models"
        columns={[
          { key: 'n', header: 'Model', render: (r) => <span className="font-medium text-navy-900">{r.make} {r.name}</span> },
          { key: 'c', header: 'Category', render: (r) => r.category.name },
          { key: 's', header: 'Seats', align: 'right', render: (r) => r.seats },
          { key: 'l', header: 'Bags', align: 'right', render: (r) => r.luggageBags },
          { key: 'f', header: 'Fuel', render: (r) => FUEL_LABEL[r.fuelType] ?? r.fuelType },
          { key: 't', header: 'Transmission', render: (r) => titleCase(r.transmission) },
          { key: 'v', header: 'Vehicles', align: 'right', render: (r) => r._count.vehicles },
          { key: 'st', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (r) =>
              canWrite && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(r)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(r)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New model' : 'Edit model'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormGrid>
            <Field label="Category" required error={f.errors.categoryId} className="sm:col-span-2">
              <Select value={f.form.categoryId} onChange={(e) => f.set('categoryId', e.target.value)} invalid={!!f.errors.categoryId}>
                <option value="">Select…</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Make" required error={f.errors.make}>
              <Input value={f.form.make} onChange={(e) => f.set('make', e.target.value)} placeholder="Toyota" invalid={!!f.errors.make} />
            </Field>
            <Field label="Model name" required error={f.errors.name}>
              <Input value={f.form.name} onChange={(e) => f.set('name', e.target.value)} placeholder="Innova Crysta" invalid={!!f.errors.name} />
            </Field>
            <Field label="Seats" required error={f.errors.seats}>
              <Input type="number" min={1} max={60} value={f.form.seats} onChange={(e) => f.set('seats', e.target.value)} invalid={!!f.errors.seats} />
            </Field>
            <Field label="Luggage bags" error={f.errors.luggageBags}>
              <Input type="number" min={0} max={40} value={f.form.luggageBags} onChange={(e) => f.set('luggageBags', e.target.value)} />
            </Field>
            <Field label="Fuel">
              <Select value={f.form.fuelType} onChange={(e) => f.set('fuelType', e.target.value)}>
                {FUEL_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {FUEL_LABEL[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Transmission">
              <Select value={f.form.transmission} onChange={(e) => f.set('transmission', e.target.value)}>
                {TRANSMISSIONS.map((x) => (
                  <option key={x} value={x}>
                    {titleCase(x)}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Checkbox label="Active" checked={f.form.isActive} onChange={(v) => f.set('isActive', v)} />
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete model" message={`Delete ${del?.make} ${del?.name}? Models in use can't be deleted — deactivate them instead.`} confirmLabel="Delete" onConfirm={() => remove(del!)} />
    </>
  );
}

// ───────────── Cities ─────────────

const emptyCity = { name: '', state: 'Odisha', isActive: true };

function Cities({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<CityRow[]>('/admin/cities');
  const [editing, setEditing] = useState<CityRow | 'new' | null>(null);
  const f = useForm(emptyCity);
  const [busy, setBusy] = useState(false);

  function open(c: CityRow | 'new') {
    f.reset(c === 'new' ? emptyCity : { name: c.name, state: c.state, isActive: c.isActive });
    setEditing(c);
  }
  async function save() {
    const body = { name: f.form.name.trim(), state: f.form.state.trim(), isActive: f.form.isActive };
    setBusy(true);
    try {
      if (editing === 'new') await api('/admin/cities', { method: 'POST', body });
      else await api(`/admin/cities/${(editing as CityRow).id}`, { method: 'PUT', body });
      toast.success('City saved');
      setEditing(null);
      reload();
    } catch (e) {
      f.setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterBar
        actions={
          canWrite && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
              New city
            </Button>
          )
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        empty="No cities"
        columns={[
          { key: 'n', header: 'City', render: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
          { key: 's', header: 'State', render: (r) => r.state },
          { key: 'v', header: 'Vehicles', align: 'right', render: (r) => r._count.vehicles },
          { key: 'd', header: 'Drivers', align: 'right', render: (r) => r._count.drivers },
          { key: 'st', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (r) =>
              canWrite && (
                <Button size="sm" variant="ghost" onClick={() => open(r)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
              ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New city' : 'Edit city'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="City" required error={f.errors.name}>
            <Input value={f.form.name} onChange={(e) => f.set('name', e.target.value)} invalid={!!f.errors.name} />
          </Field>
          <Field label="State" required error={f.errors.state}>
            <Input value={f.form.state} onChange={(e) => f.set('state', e.target.value)} invalid={!!f.errors.state} />
          </Field>
          <Checkbox label="Active" checked={f.form.isActive} onChange={(v) => f.set('isActive', v)} />
        </div>
      </Modal>
    </>
  );
}
