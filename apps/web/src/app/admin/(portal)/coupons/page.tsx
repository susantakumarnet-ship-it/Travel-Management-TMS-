'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { PURPOSE_LABEL, fmtDate, fromLocalInput, inr, toLocalInput } from '@/lib/format';
import type { TravelPurpose } from '@/lib/types';
import { Badge, Modal, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useForm, usePerm } from '@/components/admin/hooks';
import { Cell, FormGrid, ReadOnlyNotice, Switch } from '@/components/admin/bits';
import { PURPOSES, reportError } from '@/components/admin/utils';

interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  validFrom: string;
  validTo: string;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  purposes: TravelPurpose[];
  categoryIds: string[];
  isActive: boolean;
  isFeatured: boolean;
  _count: { redemptions: number };
}

export default function CouponsPage() {
  const { data, loading, error, reload, setData } = useApi<Coupon[]>('/admin/coupons');
  const { data: cats } = useApi<{ id: string; name: string }[]>('/admin/categories');
  const { canWrite } = usePerm('coupons');
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  async function toggle(c: Coupon, patch: Partial<Pick<Coupon, 'isActive' | 'isFeatured'>>) {
    setData((list) => list?.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) ?? null);
    try {
      await api(`/admin/coupons/${c.id}`, { method: 'PUT', body: patch });
      toast.success('Coupon updated');
    } catch (e) {
      reportError(e);
      reload();
    }
  }

  const now = Date.now();
  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => (
        <div>
          <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-sm font-bold text-navy-900">{c.code}</span>
          <div className="mt-1 text-xs text-slate-500">{c.title}</div>
        </div>
      ),
    },
    {
      key: 'disc',
      header: 'Discount',
      render: (c) => (
        <Cell
          primary={c.discountType === 'PERCENT' ? `${Number(c.value)}% off` : `${inr(Number(c.value))} off`}
          secondary={[c.maxDiscount ? `max ${inr(Number(c.maxDiscount))}` : null, Number(c.minOrderAmount) ? `min ${inr(Number(c.minOrderAmount))}` : null].filter(Boolean).join(' · ') || undefined}
        />
      ),
    },
    {
      key: 'valid',
      header: 'Validity',
      render: (c) => {
        const state = new Date(c.validTo).getTime() < now ? 'Expired' : new Date(c.validFrom).getTime() > now ? 'Scheduled' : null;
        return (
          <div className="whitespace-nowrap text-sm">
            {fmtDate(c.validFrom)} – {fmtDate(c.validTo)}
            {state && <Badge tone={state === 'Expired' ? 'red' : 'blue'} className="ml-2">{state}</Badge>}
          </div>
        );
      },
    },
    {
      key: 'scope',
      header: 'Applies to',
      render: (c) => (
        <div className="max-w-[220px] text-xs text-slate-600">
          {c.purposes.length ? c.purposes.map((p) => PURPOSE_LABEL[p]).join(', ') : 'All purposes'}
          <div className="text-slate-400">{c.categoryIds.length ? `${c.categoryIds.length} categor${c.categoryIds.length === 1 ? 'y' : 'ies'}` : 'All categories'}</div>
        </div>
      ),
    },
    { key: 'used', header: 'Used', align: 'right', render: (c) => <span className="tabular-nums">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</span> },
    { key: 'active', header: 'Active', align: 'center', render: (c) => <Switch checked={c.isActive} disabled={!canWrite} onChange={(v) => toggle(c, { isActive: v })} label="Active" /> },
    { key: 'feat', header: 'Featured', align: 'center', render: (c) => <Switch checked={c.isFeatured} disabled={!canWrite} onChange={(v) => toggle(c, { isFeatured: v })} label="Featured" /> },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (c) =>
        canWrite ? (
          <div className="flex justify-end gap-1">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-mist-100 hover:text-navy-800" onClick={() => setEditing(c)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleting(c)} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Coupons & offers"
        subtitle="Discount codes, festive offers and featured promotions"
        actions={
          canWrite ? (
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New coupon
            </Button>
          ) : undefined
        }
      />
      {!canWrite && <ReadOnlyNotice module="coupons" />}
      <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(c) => c.id} empty="No coupons yet" emptyDescription="Create a coupon to run an offer." />
      {editing && <CouponModal coupon={editing === 'new' ? null : editing} categories={cats ?? []} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete coupon"
        message={deleting ? `Delete ${deleting.code}? Coupons that have been redeemed are deactivated instead of deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            const r = await api<{ ok: boolean; deactivated?: boolean }>(`/admin/coupons/${deleting!.id}`, { method: 'DELETE' });
            toast.success(r.deactivated ? 'Coupon has redemptions — it was deactivated instead' : 'Coupon deleted');
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

function CouponModal({ coupon, categories, onClose, onSaved }: { coupon: Coupon | null; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { form, set, errors, setErrors } = useForm({
    code: coupon?.code ?? '',
    title: coupon?.title ?? '',
    description: coupon?.description ?? '',
    discountType: coupon?.discountType ?? ('PERCENT' as 'PERCENT' | 'FLAT'),
    value: coupon ? String(Number(coupon.value)) : '',
    maxDiscount: coupon?.maxDiscount != null ? String(Number(coupon.maxDiscount)) : '',
    minOrderAmount: coupon ? String(Number(coupon.minOrderAmount)) : '0',
    validFrom: toLocalInput(coupon ? new Date(coupon.validFrom) : new Date()),
    validTo: toLocalInput(coupon ? new Date(coupon.validTo) : new Date(Date.now() + 30 * 86_400_000)),
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : '',
    perUserLimit: coupon ? String(coupon.perUserLimit) : '1',
    purposes: (coupon?.purposes ?? []) as string[],
    categoryIds: coupon?.categoryIds ?? ([] as string[]),
    isActive: coupon?.isActive ?? true,
    isFeatured: coupon?.isFeatured ?? false,
  });
  const [busy, setBusy] = useState(false);
  const toggleIn = (k: 'purposes' | 'categoryIds', v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);

  async function save() {
    setBusy(true);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        value: Number(form.value),
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        minOrderAmount: Number(form.minOrderAmount || 0),
        validFrom: fromLocalInput(form.validFrom),
        validTo: fromLocalInput(form.validTo),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        perUserLimit: Number(form.perUserLimit || 1),
        purposes: form.purposes,
        categoryIds: form.categoryIds,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
      };
      if (coupon) await api(`/admin/coupons/${coupon.id}`, { method: 'PUT', body });
      else await api('/admin/coupons', { method: 'POST', body });
      toast.success(coupon ? 'Coupon updated' : 'Coupon created');
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
      title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={!form.code || !form.title || !form.value}>
            {coupon ? 'Save changes' : 'Create coupon'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Code" required error={errors.code} hint="3–30 letters, digits, - or _">
            <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} invalid={!!errors.code} className="font-mono uppercase" maxLength={30} />
          </Field>
          <Field label="Title" required error={errors.title}>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} maxLength={120} />
          </Field>
        </FormGrid>
        <Field label="Description" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} />
        </Field>
        <FormGrid cols={4}>
          <Field label="Type" required error={errors.discountType}>
            <Select value={form.discountType} onChange={(e) => set('discountType', e.target.value as 'PERCENT' | 'FLAT')}>
              <option value="PERCENT">Percent</option>
              <option value="FLAT">Flat ₹</option>
            </Select>
          </Field>
          <Field label={form.discountType === 'PERCENT' ? 'Value (%)' : 'Value (₹)'} required error={errors.value}>
            <Input type="number" min={0} max={form.discountType === 'PERCENT' ? 100 : undefined} value={form.value} onChange={(e) => set('value', e.target.value)} invalid={!!errors.value} />
          </Field>
          <Field label="Max discount (₹)" error={errors.maxDiscount}>
            <Input type="number" min={0} value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} placeholder="No cap" />
          </Field>
          <Field label="Min order (₹)" error={errors.minOrderAmount}>
            <Input type="number" min={0} value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
          </Field>
        </FormGrid>
        <FormGrid cols={4}>
          <Field label="Valid from" required error={errors.validFrom} className="lg:col-span-1">
            <Input type="datetime-local" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} invalid={!!errors.validFrom} />
          </Field>
          <Field label="Valid to" required error={errors.validTo}>
            <Input type="datetime-local" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} invalid={!!errors.validTo} />
          </Field>
          <Field label="Total uses" error={errors.usageLimit}>
            <Input type="number" min={1} value={form.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} placeholder="Unlimited" />
          </Field>
          <Field label="Per customer" error={errors.perUserLimit}>
            <Input type="number" min={1} value={form.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value)} />
          </Field>
        </FormGrid>
        <div>
          <p className="label">Travel purposes (none = all)</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PURPOSES.map((p) => (
              <Checkbox key={p} label={PURPOSE_LABEL[p]} checked={form.purposes.includes(p)} onChange={() => toggleIn('purposes', p)} />
            ))}
          </div>
        </div>
        <div>
          <p className="label">Vehicle categories (none = all)</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <Checkbox key={c.id} label={c.name} checked={form.categoryIds.includes(c.id)} onChange={() => toggleIn('categoryIds', c.id)} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-6 border-t border-mist-200 pt-4">
          <Checkbox label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} />
          <Checkbox label="Featured on website" description="Shown in the offers section" checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} />
        </div>
      </div>
    </Modal>
  );
}
