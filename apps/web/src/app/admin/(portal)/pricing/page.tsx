'use client';

import { useState, type ReactNode } from 'react';
import { CalendarRange, Clock, Landmark, Moon, Pencil, Plus, Sparkles, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useForm, usePerm } from '@/components/admin/hooks';
import { FormGrid, ReadOnlyNotice, Switch } from '@/components/admin/bits';
import { dateInput, reportError } from '@/components/admin/utils';

type RuleType = 'SEASONAL' | 'PEAK_DATE' | 'WEEKEND' | 'NIGHT' | 'STATE_TAX' | 'WAITING';
interface Rule {
  id: string;
  name: string;
  type: RuleType;
  categoryId: string | null;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: number[];
  multiplier: number | null;
  flatAmount: number | null;
  state: string | null;
  config: Record<string, number | boolean | string> | null;
  priority: number;
  isActive: boolean;
  category: { name: string } | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPES: { type: RuleType; label: string; icon: ReactNode; help: string }[] = [
  { type: 'SEASONAL', label: 'Seasonal', icon: <Sun className="h-4 w-4" />, help: 'Multiplies the time & distance fare for every trip day inside the date window (e.g. wedding season +20%). The highest seasonal/peak rule on a day wins.' },
  { type: 'PEAK_DATE', label: 'Peak dates', icon: <Sparkles className="h-4 w-4" />, help: 'Like seasonal but for short spikes — festivals, auspicious wedding dates, New Year.' },
  { type: 'WEEKEND', label: 'Weekend / weekday', icon: <CalendarRange className="h-4 w-4" />, help: 'Uplift on selected days of the week. Stacks on top of seasonal/peak multipliers. Optional date window.' },
  { type: 'NIGHT', label: 'Night charges', icon: <Moon className="h-4 w-4" />, help: "Overrides the night window and the per-night driver charge (otherwise the vehicle's own night charge and the global night hours are used)." },
  { type: 'STATE_TAX', label: 'State entry tax', icon: <Landmark className="h-4 w-4" />, help: 'Pass-through permit / entry tax added when the trip destination is in the given state. Not subject to GST.' },
  { type: 'WAITING', label: 'Waiting charges', icon: <Clock className="h-4 w-4" />, help: 'Free waiting minutes and hourly rate for waiting time (otherwise the vehicle extra-hour rate applies).' },
];
const TYPE_META = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<RuleType, (typeof TYPES)[number]>;
const pct = (m: number | null) => (m == null ? '—' : `${Number(m) >= 1 ? '+' : ''}${Math.round((Number(m) - 1) * 1000) / 10}%`);

function describe(r: Rule) {
  const parts: string[] = [];
  if (r.type === 'SEASONAL' || r.type === 'PEAK_DATE') parts.push(`${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`, pct(r.multiplier));
  if (r.type === 'WEEKEND') {
    parts.push(r.daysOfWeek.map((d) => DAYS[d]).join(', '), pct(r.multiplier));
    if (r.startDate || r.endDate) parts.push(`${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`);
  }
  if (r.type === 'NIGHT') parts.push(`${r.config?.startHour ?? '—'}:00 – ${r.config?.endHour ?? '—'}:00`, r.flatAmount != null ? `${inr(Number(r.flatAmount))}/night` : 'vehicle rate');
  if (r.type === 'STATE_TAX') parts.push(r.state ?? '—', `${inr(Number(r.flatAmount ?? 0))}${r.config?.perDay === true ? ' per day' : ' per trip'}`);
  if (r.type === 'WAITING') parts.push(`${r.config?.freeMinutes ?? 0} min free`, r.config?.perHour != null ? `${inr(Number(r.config.perHour))}/hr` : 'vehicle extra-hour rate');
  return parts.join(' · ');
}

export default function PricingRulesPage() {
  const { data, loading, error, reload, setData } = useApi<Rule[]>('/admin/pricing-rules');
  const { data: cats } = useApi<{ id: string; name: string }[]>('/admin/categories');
  const { canWrite } = usePerm('settings');
  const [editing, setEditing] = useState<Rule | { type: RuleType } | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  async function toggle(r: Rule, isActive: boolean) {
    setData((list) => list?.map((x) => (x.id === r.id ? { ...x, isActive } : x)) ?? null);
    try {
      const { id, category, ...rest } = r;
      void category;
      await api(`/admin/pricing-rules/${id}`, { method: 'PUT', body: { ...rest, multiplier: rest.multiplier != null ? Number(rest.multiplier) : null, flatAmount: rest.flatAmount != null ? Number(rest.flatAmount) : null, startDate: dateInput(rest.startDate) || null, endDate: dateInput(rest.endDate) || null, isActive } });
      toast.success(isActive ? 'Rule enabled' : 'Rule disabled');
    } catch (e) {
      reportError(e);
      reload();
    }
  }

  return (
    <div>
      <PageHeader
        title="Pricing rules"
        subtitle="Configure surcharges and multipliers applied by the pricing engine — no code changes needed"
        actions={
          canWrite ? (
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ type: 'SEASONAL' })}>
              New rule
            </Button>
          ) : undefined
        }
      />
      {!canWrite && <ReadOnlyNotice module="pricing rules" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-64" />}
      <div className="space-y-6">
        {data &&
          TYPES.map((t) => {
            const rules = data.filter((r) => r.type === t.type);
            return (
              <Card key={t.type}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="h-fit rounded-xl bg-gold-50 p-2 text-gold-700 ring-1 ring-gold-200">{t.icon}</div>
                    <div>
                      <h3 className="text-base font-semibold text-navy-900">{t.label}</h3>
                      <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{t.help}</p>
                    </div>
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ type: t.type })}>
                      Add
                    </Button>
                  )}
                </div>
                {rules.length ? (
                  <ul className="divide-y divide-mist-100 rounded-xl border border-mist-200">
                    {rules.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy-900">
                            {r.name}
                            <Badge tone={r.category ? 'indigo' : 'gray'} className="ml-2">
                              {r.category?.name ?? 'All categories'}
                            </Badge>
                            {r.priority !== 0 && <span className="ml-2 text-xs text-slate-400">priority {r.priority}</span>}
                          </p>
                          <p className="text-sm text-slate-600">{describe(r)}</p>
                        </div>
                        <Switch checked={r.isActive} disabled={!canWrite} onChange={(v) => toggle(r, v)} label="Active" />
                        {canWrite && (
                          <>
                            <button className="rounded-lg p-2 text-slate-500 hover:bg-mist-100 hover:text-navy-800" onClick={() => setEditing(r)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleting(r)} aria-label="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-mist-300 bg-mist-50 px-4 py-4 text-sm text-slate-500">No {t.label.toLowerCase()} rules — defaults apply.</p>
                )}
              </Card>
            );
          })}
        {data && !data.length && !loading && <EmptyState title="No pricing rules yet" description="Vehicle base rates and global settings are used until you add rules." />}
      </div>
      {editing && <RuleModal rule={'id' in editing ? editing : null} initialType={editing.type} categories={cats ?? []} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete pricing rule"
        message={deleting ? `Delete “${deleting.name}”? New quotes will no longer include it. Existing bookings are unaffected.` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api(`/admin/pricing-rules/${deleting!.id}`, { method: 'DELETE' });
            toast.success('Rule deleted');
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

function RuleModal({ rule, initialType, categories, onClose, onSaved }: { rule: Rule | null; initialType: RuleType; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const c = rule?.config ?? {};
  const { form, set, errors, setErrors } = useForm({
    name: rule?.name ?? '',
    type: rule?.type ?? initialType,
    categoryId: rule?.categoryId ?? '',
    startDate: dateInput(rule?.startDate),
    endDate: dateInput(rule?.endDate),
    daysOfWeek: rule?.daysOfWeek ?? (initialType === 'WEEKEND' ? [0, 6] : []),
    uplift: rule?.multiplier != null ? String(Math.round((Number(rule.multiplier) - 1) * 1000) / 10) : '',
    flatAmount: rule?.flatAmount != null ? String(Number(rule.flatAmount)) : '',
    state: rule?.state ?? '',
    startHour: c.startHour != null ? String(c.startHour) : '22',
    endHour: c.endHour != null ? String(c.endHour) : '6',
    freeMinutes: c.freeMinutes != null ? String(c.freeMinutes) : '30',
    perHour: c.perHour != null ? String(c.perHour) : '',
    perDay: c.perDay === true,
    priority: String(rule?.priority ?? 0),
    isActive: rule?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const t = form.type;
  const usesMultiplier = t === 'SEASONAL' || t === 'PEAK_DATE' || t === 'WEEKEND';
  const usesDates = t === 'SEASONAL' || t === 'PEAK_DATE' || t === 'WEEKEND';
  const datesRequired = t === 'SEASONAL' || t === 'PEAK_DATE';

  async function save() {
    setBusy(true);
    try {
      let config: Record<string, number | boolean> | null = null;
      if (t === 'NIGHT') config = { startHour: Number(form.startHour), endHour: Number(form.endHour) };
      if (t === 'WAITING') config = { freeMinutes: Number(form.freeMinutes || 0), ...(form.perHour !== '' ? { perHour: Number(form.perHour) } : {}) };
      if (t === 'STATE_TAX') config = { perDay: form.perDay };
      const body = {
        name: form.name.trim(),
        type: t,
        categoryId: form.categoryId || null,
        startDate: usesDates && form.startDate ? form.startDate : null,
        endDate: usesDates && form.endDate ? form.endDate : null,
        daysOfWeek: t === 'WEEKEND' ? form.daysOfWeek : [],
        multiplier: usesMultiplier && form.uplift !== '' ? Math.round((1 + Number(form.uplift) / 100) * 1000) / 1000 : null,
        flatAmount: (t === 'NIGHT' || t === 'STATE_TAX') && form.flatAmount !== '' ? Number(form.flatAmount) : null,
        state: t === 'STATE_TAX' ? form.state.trim() || null : null,
        config,
        priority: Number(form.priority || 0),
        isActive: form.isActive,
      };
      if (rule) await api(`/admin/pricing-rules/${rule.id}`, { method: 'PUT', body });
      else await api('/admin/pricing-rules', { method: 'POST', body });
      toast.success(rule ? 'Rule updated' : 'Rule created');
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
      title={rule ? 'Edit pricing rule' : 'New pricing rule'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={form.name.trim().length < 2}>
            {rule ? 'Save rule' : 'Create rule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <Field label="Rule type" required error={errors.type}>
            <Select value={t} onChange={(e) => set('type', e.target.value as RuleType)} disabled={!!rule}>
              {TYPES.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} placeholder={t === 'SEASONAL' ? 'Wedding season 2026' : t === 'STATE_TAX' ? 'Andhra Pradesh entry tax' : ''} maxLength={120} />
          </Field>
        </FormGrid>
        <p className="rounded-xl bg-mist-50 px-4 py-3 text-sm text-slate-600">{TYPE_META[t].help}</p>

        {usesDates && (
          <FormGrid>
            <Field label="Start date" required={datesRequired} error={errors.startDate}>
              <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="End date" required={datesRequired} error={errors.endDate} hint="Inclusive">
              <Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </FormGrid>
        )}

        {t === 'WEEKEND' && (
          <div>
            <p className="label">Days</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = form.daysOfWeek.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('daysOfWeek', on ? form.daysOfWeek.filter((x) => x !== i) : [...form.daysOfWeek, i].sort())}
                    className={on ? 'rounded-lg border border-navy-900 bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white' : 'rounded-lg border border-mist-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-navy-300'}
                    aria-pressed={on}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {errors.daysOfWeek && <p className="mt-1 text-xs font-medium text-red-600">{errors.daysOfWeek}</p>}
          </div>
        )}

        {usesMultiplier && (
          <Field label="Price uplift (%)" required error={errors.multiplier} hint={form.uplift !== '' ? `Multiplier ×${Math.round((1 + Number(form.uplift) / 100) * 1000) / 1000} on time & distance fare. Use a negative value for a discount.` : 'e.g. 15 = +15%'}>
            <Input type="number" step="0.5" min={-90} max={400} value={form.uplift} onChange={(e) => set('uplift', e.target.value)} invalid={!!errors.multiplier} />
          </Field>
        )}

        {t === 'NIGHT' && (
          <FormGrid cols={3}>
            <Field label="Night starts (hour)" error={errors.config}>
              <Input type="number" min={0} max={23} value={form.startHour} onChange={(e) => set('startHour', e.target.value)} />
            </Field>
            <Field label="Night ends (hour)">
              <Input type="number" min={0} max={23} value={form.endHour} onChange={(e) => set('endHour', e.target.value)} />
            </Field>
            <Field label="Charge per night (₹)" error={errors.flatAmount} hint="Blank = vehicle's own night charge">
              <Input type="number" min={0} value={form.flatAmount} onChange={(e) => set('flatAmount', e.target.value)} />
            </Field>
          </FormGrid>
        )}

        {t === 'STATE_TAX' && (
          <>
            <FormGrid>
              <Field label="Destination state" required error={errors.state}>
                <Input value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="e.g. Andhra Pradesh" maxLength={80} />
              </Field>
              <Field label="Tax amount (₹)" required error={errors.flatAmount}>
                <Input type="number" min={0} value={form.flatAmount} onChange={(e) => set('flatAmount', e.target.value)} />
              </Field>
            </FormGrid>
            <Checkbox label="Charge per trip day" description="Otherwise charged once per trip" checked={form.perDay} onChange={(v) => set('perDay', v)} />
          </>
        )}

        {t === 'WAITING' && (
          <FormGrid>
            <Field label="Free waiting (minutes)" error={errors.config}>
              <Input type="number" min={0} value={form.freeMinutes} onChange={(e) => set('freeMinutes', e.target.value)} />
            </Field>
            <Field label="Rate per hour (₹)" hint="Blank = vehicle's extra-hour rate">
              <Input type="number" min={0} value={form.perHour} onChange={(e) => set('perHour', e.target.value)} />
            </Field>
          </FormGrid>
        )}

        <FormGrid>
          <Field label="Vehicle category" error={errors.categoryId}>
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" error={errors.priority} hint="Higher priority rules are listed and matched first">
            <Input type="number" value={form.priority} onChange={(e) => set('priority', e.target.value)} />
          </Field>
        </FormGrid>
        <Checkbox label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} />
      </div>
    </Modal>
  );
}
