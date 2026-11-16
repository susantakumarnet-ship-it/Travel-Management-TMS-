'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { ErrorState, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { FormGrid, PageSkeleton, ReadOnlyNotice, Section } from '@/components/admin/bits';
import { usePerm } from '@/components/admin/hooks';
import { reportError } from '@/components/admin/utils';

type Tier = { hoursBefore: number; refundPercent: number };
type Values = Record<string, unknown>;

interface FieldDef {
  key: string;
  label: string;
  kind: 'number' | 'text' | 'bool' | 'textarea';
  hint?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

const GROUPS: { title: string; subtitle: string; fields: FieldDef[] }[] = [
  {
    title: 'Booking',
    subtitle: 'Advance payment, slot holds and lead time',
    fields: [
      { key: 'booking.advancePercent', label: 'Advance payment', kind: 'number', suffix: '%', min: 0, max: 100, hint: 'Share of the total collected at booking' },
      { key: 'booking.holdMinutes', label: 'Unpaid hold', kind: 'number', suffix: 'min', min: 1, hint: 'How long a vehicle is reserved while awaiting payment' },
      { key: 'booking.minLeadHours', label: 'Minimum lead time', kind: 'number', suffix: 'hours', min: 0, hint: 'Earliest pickup from now' },
      { key: 'booking.bufferMinutes', label: 'Buffer between trips', kind: 'number', suffix: 'min', min: 0, hint: 'Cleaning / repositioning gap after each trip' },
      { key: 'booking.ownerAutoAccept', label: 'Auto-accept bookings for owners', kind: 'bool', hint: 'If off, owners must accept each booking' },
    ],
  },
  {
    title: 'Tax',
    subtitle: 'GST applied by the pricing engine and invoices',
    fields: [
      { key: 'tax.gstPercent', label: 'GST rate', kind: 'number', suffix: '%', min: 0, max: 28 },
      { key: 'tax.sacCode', label: 'SAC code', kind: 'text', hint: 'Printed on tax invoices' },
    ],
  },
  {
    title: 'Commission',
    subtitle: 'Platform share when neither category nor owner overrides it',
    fields: [{ key: 'commission.defaultPercent', label: 'Default commission', kind: 'number', suffix: '%', min: 0, max: 100 }],
  },
  {
    title: 'Pricing',
    subtitle: 'Night charges and outstation minimums',
    fields: [
      { key: 'pricing.nightStartHour', label: 'Night starts at', kind: 'number', suffix: 'h (0–23)', min: 0, max: 23 },
      { key: 'pricing.nightEndHour', label: 'Night ends at', kind: 'number', suffix: 'h (0–23)', min: 0, max: 23 },
      { key: 'pricing.outstationMinKmPerDay', label: 'Outstation minimum', kind: 'number', suffix: 'km/day', min: 0 },
    ],
  },
  {
    title: 'Contact',
    subtitle: 'Shown on the website, invoices and messages',
    fields: [
      { key: 'contact.phone', label: 'Phone', kind: 'text' },
      { key: 'contact.email', label: 'Email', kind: 'text' },
      { key: 'contact.whatsapp', label: 'WhatsApp number', kind: 'text', hint: 'Digits with country code, e.g. 919000000000' },
      { key: 'contact.address', label: 'Address', kind: 'textarea' },
    ],
  },
  {
    title: 'Reminders',
    subtitle: 'Automated reminders to customers, owners and drivers',
    fields: [{ key: 'reminders.pickupHoursBefore', label: 'Pickup reminder', kind: 'number', suffix: 'hours before', min: 0 }],
  },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'On' : 'Off') : Array.isArray(v) ? v.join(', ') : String(v));

function TiersEditor({ tiers, onChange, disabled }: { tiers: Tier[]; onChange: (t: Tier[]) => void; disabled: boolean }) {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full max-w-lg text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-3">Cancelled at least (hours before pickup)</th>
              <th className="pb-2 pr-3">Refund %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td className="py-1 pr-3">
                  <Input type="number" min={0} value={String(t.hoursBefore)} disabled={disabled} onChange={(e) => onChange(tiers.map((x, k) => (k === i ? { ...x, hoursBefore: Number(e.target.value) } : x)))} aria-label="Hours before" />
                </td>
                <td className="py-1 pr-3">
                  <Input type="number" min={0} max={100} value={String(t.refundPercent)} disabled={disabled} onChange={(e) => onChange(tiers.map((x, k) => (k === i ? { ...x, refundPercent: Number(e.target.value) } : x)))} aria-label="Refund percent" />
                </td>
                <td className="py-1">
                  {!disabled && tiers.length > 1 && (
                    <button type="button" onClick={() => onChange(tiers.filter((_, k) => k !== i))} className="rounded p-2 text-slate-400 hover:text-red-600" aria-label="Remove tier">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...tiers, { hoursBefore: 0, refundPercent: 0 }])}>
            Add tier
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(sorted)}>
            Sort
          </Button>
        </div>
      )}
      <div className="rounded-xl bg-mist-50 px-4 py-3 text-sm text-slate-600">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer sees</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {sorted.map((t, i) => (
            <li key={i}>
              {i === 0 ? `${t.hoursBefore}+ hours before pickup` : `${t.hoursBefore}–${sorted[i - 1].hoursBefore} hours before pickup`}: <strong>{t.refundPercent}% refund</strong>
            </li>
          ))}
          {sorted.length > 0 && sorted[sorted.length - 1].hoursBefore > 0 && <li>Less than {sorted[sorted.length - 1].hoursBefore} hours: no refund</li>}
        </ul>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { canWrite } = usePerm('settings');
  const { data, loading, error, reload } = useApi<{ values: Values; defaults: Values }>('/admin/settings');
  const [form, setForm] = useState<Values>({});
  const [daysText, setDaysText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data.values);
      setDaysText(((data.values['reminders.documentExpiryDays'] as number[]) ?? []).join(', '));
    }
  }, [data]);

  const parsedDays = useMemo(
    () =>
      daysText
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number),
    [daysText],
  );
  const daysInvalid = parsedDays.some((n) => !Number.isFinite(n) || n < 0);

  const effective = useMemo<Values>(() => ({ ...form, 'reminders.documentExpiryDays': daysInvalid ? form['reminders.documentExpiryDays'] : [...parsedDays].sort((a, b) => b - a) }), [form, parsedDays, daysInvalid]);
  const changed = useMemo(() => (data ? Object.keys(effective).filter((k) => k in data.defaults && !same(effective[k], data.values[k])) : []), [effective, data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <PageSkeleton />;

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const tiers = (form['cancellation.tiers'] as Tier[]) ?? [];
  const tierError = tiers.some((t) => !Number.isFinite(t.hoursBefore) || t.hoursBefore < 0 || !Number.isFinite(t.refundPercent) || t.refundPercent < 0 || t.refundPercent > 100);

  function fieldError(f: FieldDef): string | undefined {
    const v = form[f.key];
    if (f.kind !== 'number') return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'Enter a number';
    if (f.min != null && v < f.min) return `Minimum ${f.min}`;
    if (f.max != null && v > f.max) return `Maximum ${f.max}`;
    return undefined;
  }
  const anyInvalid = tierError || daysInvalid || GROUPS.some((g) => g.fields.some((f) => fieldError(f)));

  async function save() {
    setBusy(true);
    try {
      const patch: Values = {};
      for (const k of changed) {
        let v = effective[k];
        if (k === 'cancellation.tiers') v = [...(v as Tier[])].sort((a, b) => b.hoursBefore - a.hoursBefore);
        patch[k] = v;
      }
      await api('/admin/settings', { method: 'PUT', body: patch });
      toast.success(`Saved ${changed.length} setting${changed.length === 1 ? '' : 's'}`);
      await reload();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  const resetBtn = (k: string, onReset?: () => void) =>
    canWrite && !same(effective[k], data.defaults[k]) ? (
      <button
        type="button"
        onClick={() => {
          if (onReset) onReset();
          else set(k, data.defaults[k]);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:underline"
        title="Reset to default"
      >
        <RotateCcw className="h-3 w-3" /> Default
      </button>
    ) : null;

  const renderField = (f: FieldDef): ReactNode => {
    const v = form[f.key];
    const def = data.defaults[f.key];
    const err = fieldError(f);
    const label = (
      <span className="flex items-center justify-between gap-2">
        <span>{f.label}</span>
        {resetBtn(f.key)}
      </span>
    );
    if (f.kind === 'bool')
      return (
        <div key={f.key} className="sm:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <Checkbox label={f.label} description={`${f.hint ?? ''}${f.hint ? ' · ' : ''}Default: ${show(def)}`} checked={!!v} onChange={(x) => set(f.key, x)} disabled={!canWrite} />
            {resetBtn(f.key)}
          </div>
        </div>
      );
    return (
      <div key={f.key} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
        <label className="label">{label}</label>
        {f.kind === 'textarea' ? (
          <Textarea value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} rows={2} disabled={!canWrite} />
        ) : (
          <div className="relative">
            <Input
              type={f.kind === 'number' ? 'number' : 'text'}
              min={f.min}
              max={f.max}
              value={v == null || (typeof v === 'number' && Number.isNaN(v)) ? '' : String(v)}
              onChange={(e) => set(f.key, f.kind === 'number' ? (e.target.value === '' ? NaN : Number(e.target.value)) : e.target.value)}
              disabled={!canWrite}
              invalid={!!err}
              className={f.suffix ? 'pr-24' : ''}
            />
            {f.suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{f.suffix}</span>}
          </div>
        )}
        {err ? <p className="mt-1 text-xs font-medium text-red-600">{err}</p> : <p className="mt-1 text-xs text-slate-500">{f.hint ? `${f.hint} · ` : ''}Default: {show(def)}</p>}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="System settings"
        subtitle="Business rules applied across bookings, pricing and notifications — no code changes needed"
        actions={
          canWrite && (
            <>
              {changed.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm(data.values);
                    setDaysText(((data.values['reminders.documentExpiryDays'] as number[]) ?? []).join(', '));
                  }}
                >
                  Discard
                </Button>
              )}
              <Button onClick={save} loading={busy} disabled={!changed.length || anyInvalid}>
                {changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}
              </Button>
            </>
          )
        }
      />
      {!canWrite && <ReadOnlyNotice module="settings" />}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {GROUPS.slice(0, 4).map((g) => (
          <Section key={g.title} title={g.title} subtitle={g.subtitle}>
            <FormGrid>{g.fields.map(renderField)}</FormGrid>
          </Section>
        ))}
        <Section title="Cancellation & refunds" subtitle="Refund tiers by how early the customer cancels" action={resetBtn('cancellation.tiers')} className="xl:col-span-2">
          <TiersEditor tiers={tiers} onChange={(t) => set('cancellation.tiers', t)} disabled={!canWrite} />
          {tierError && <p className="mt-2 text-xs font-medium text-red-600">Hours must be ≥ 0 and refund between 0 and 100%.</p>}
        </Section>
        {GROUPS.slice(4).map((g) => (
          <Section key={g.title} title={g.title} subtitle={g.subtitle}>
            <FormGrid>
              {g.fields.map(renderField)}
              {g.title === 'Reminders' && (
                <div className="sm:col-span-2">
                  <label className="label">
                    <span className="flex items-center justify-between gap-2">
                      <span>Document expiry reminders (days before)</span>
                      {resetBtn('reminders.documentExpiryDays', () => setDaysText((data.defaults['reminders.documentExpiryDays'] as number[]).join(', ')))}
                    </span>
                  </label>
                  <Field error={daysInvalid ? 'Enter non-negative numbers separated by commas' : undefined} hint={`Comma separated · Default: ${show(data.defaults['reminders.documentExpiryDays'])}`}>
                    <Input value={daysText} onChange={(e) => setDaysText(e.target.value)} disabled={!canWrite} invalid={daysInvalid} placeholder="30, 15, 7, 1" />
                  </Field>
                </div>
              )}
            </FormGrid>
          </Section>
        ))}
      </div>
    </>
  );
}
