'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { FUEL_LABEL, titleCase } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormGrid, Section } from './bits';
import { ListEditor } from './ListEditor';
import { FUEL_TYPES, TRANSMISSIONS, dateInput, reportError } from './utils';

export interface AdminVehicle {
  id: string;
  ownerId: string;
  categoryId: string;
  modelId: string;
  cityId: string;
  defaultDriverId: string | null;
  title: string;
  registrationNumber: string;
  year: number;
  color: string | null;
  seats: number;
  luggageBags: number;
  hasAc: boolean;
  fuelType: string;
  transmission: string;
  driverOption: 'WITH_DRIVER' | 'SELF_DRIVE' | 'BOTH';
  description: string | null;
  features: string[];
  decorationAvailable: boolean;
  isFeatured: boolean;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  permitType: string | null;
  permitNumber: string | null;
  permitExpiry: string | null;
  perKmRate: number;
  perDayRate: number;
  perHourRate: number;
  minBookingHours: number;
  includedKmPerDay: number;
  includedKmPerHour: number;
  extraKmRate: number;
  extraHourRate: number;
  driverAllowancePerDay: number;
  nightChargePerNight: number;
  decorationCharge: number;
  securityDeposit: number;
  selfDrivePerDayRate: number | null;
}

interface Lookup {
  id: string;
  name: string;
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
}
interface DriverRow {
  id: string;
  user: { name: string | null; phone: string };
}

const NUM_FIELDS = [
  'year',
  'seats',
  'luggageBags',
  'perKmRate',
  'perDayRate',
  'perHourRate',
  'minBookingHours',
  'includedKmPerDay',
  'includedKmPerHour',
  'extraKmRate',
  'extraHourRate',
  'driverAllowancePerDay',
  'nightChargePerNight',
  'decorationCharge',
  'securityDeposit',
] as const;
const DATE_FIELDS = ['insuranceExpiry', 'fitnessExpiry', 'pollutionExpiry', 'permitExpiry'] as const;

type FormState = Record<string, string | boolean | string[]>;

function toForm(v: Partial<AdminVehicle> | null): FormState {
  const s = (x: unknown) => (x == null ? '' : String(x));
  return {
    ownerId: s(v?.ownerId),
    categoryId: s(v?.categoryId),
    modelId: s(v?.modelId),
    cityId: s(v?.cityId),
    defaultDriverId: s(v?.defaultDriverId),
    title: s(v?.title),
    registrationNumber: s(v?.registrationNumber),
    year: s(v?.year ?? new Date().getFullYear()),
    color: s(v?.color),
    seats: s(v?.seats ?? 4),
    luggageBags: s(v?.luggageBags ?? 2),
    hasAc: v?.hasAc ?? true,
    fuelType: v?.fuelType ?? 'PETROL',
    transmission: v?.transmission ?? 'MANUAL',
    driverOption: v?.driverOption ?? 'WITH_DRIVER',
    description: s(v?.description),
    features: v?.features ?? [],
    decorationAvailable: v?.decorationAvailable ?? false,
    isFeatured: v?.isFeatured ?? false,
    insuranceExpiry: dateInput(v?.insuranceExpiry),
    fitnessExpiry: dateInput(v?.fitnessExpiry),
    pollutionExpiry: dateInput(v?.pollutionExpiry),
    permitType: s(v?.permitType),
    permitNumber: s(v?.permitNumber),
    permitExpiry: dateInput(v?.permitExpiry),
    perKmRate: s(v?.perKmRate),
    perDayRate: s(v?.perDayRate),
    perHourRate: s(v?.perHourRate),
    minBookingHours: s(v?.minBookingHours ?? 4),
    includedKmPerDay: s(v?.includedKmPerDay ?? 250),
    includedKmPerHour: s(v?.includedKmPerHour ?? 10),
    extraKmRate: s(v?.extraKmRate),
    extraHourRate: s(v?.extraHourRate),
    driverAllowancePerDay: s(v?.driverAllowancePerDay ?? 0),
    nightChargePerNight: s(v?.nightChargePerNight ?? 0),
    decorationCharge: s(v?.decorationCharge ?? 0),
    securityDeposit: s(v?.securityDeposit ?? 0),
    selfDrivePerDayRate: s(v?.selfDrivePerDayRate),
  };
}

function toPayload(f: FormState, create: boolean) {
  const out: Record<string, unknown> = {};
  const str = (k: string) => String(f[k] ?? '').trim();
  for (const k of ['categoryId', 'modelId', 'cityId', 'title', 'registrationNumber', 'fuelType', 'transmission', 'driverOption']) out[k] = str(k);
  if (create) out.ownerId = str('ownerId');
  else if (str('ownerId')) out.ownerId = str('ownerId');
  out.defaultDriverId = str('defaultDriverId') || null;
  out.color = str('color') || undefined;
  out.description = str('description') || undefined;
  out.permitType = str('permitType') || null;
  out.permitNumber = str('permitNumber') || null;
  for (const k of NUM_FIELDS) out[k] = str(k) === '' ? undefined : Number(str(k));
  for (const k of DATE_FIELDS) out[k] = str(k) || null;
  out.selfDrivePerDayRate = str('selfDrivePerDayRate') === '' ? null : Number(str('selfDrivePerDayRate'));
  out.hasAc = !!f.hasAc;
  out.decorationAvailable = !!f.decorationAvailable;
  out.features = (f.features as string[]).map((x) => x.trim()).filter(Boolean);
  if (!create) out.isFeatured = !!f.isFeatured;
  return out;
}

/** Create / edit form covering every vehicleSchema field. */
export function VehicleForm({
  initial,
  create,
  disabled,
  submitLabel = 'Save changes',
  onSubmit,
}: {
  initial: Partial<AdminVehicle> | null;
  create?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [f, setF] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const cats = useApi<Lookup[]>('/admin/categories');
  const models = useApi<ModelRow[]>('/admin/models');
  const cities = useApi<Lookup[]>('/admin/cities');
  const owners = useApi<Paged<{ id: string; businessName: string; kycStatus: string }>>('/admin/owners', { query: { pageSize: 100 } });
  const ownerId = String(f.ownerId || '');
  const drivers = useApi<Paged<DriverRow>>(ownerId ? '/admin/drivers' : null, { query: { ownerId, status: 'APPROVED', pageSize: 100 } });

  const modelOptions = useMemo(() => (models.data ?? []).filter((m) => !f.categoryId || m.categoryId === f.categoryId), [models.data, f.categoryId]);

  const set = (k: string, v: string | boolean | string[]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };
  const pickModel = (id: string) => {
    const m = models.data?.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      modelId: id,
      ...(m && (create || !p.modelId)
        ? { seats: String(m.seats), luggageBags: String(m.luggageBags), fuelType: m.fuelType, transmission: m.transmission, categoryId: m.categoryId, title: p.title || `${m.make} ${m.name}` }
        : {}),
    }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(toPayload(f, !!create));
      setErrors({});
    } catch (err) {
      setErrors(reportError(err));
    } finally {
      setBusy(false);
    }
  }

  const text = (k: string, label: string, opts: { required?: boolean; type?: string; hint?: string; placeholder?: string; step?: string } = {}) => (
    <Field label={label} error={errors[k]} required={opts.required} hint={opts.hint}>
      <Input
        type={opts.type ?? 'text'}
        step={opts.step}
        inputMode={opts.type === 'number' ? 'decimal' : undefined}
        value={String(f[k] ?? '')}
        onChange={(e) => set(k, e.target.value)}
        invalid={!!errors[k]}
        disabled={disabled}
        placeholder={opts.placeholder}
      />
    </Field>
  );
  const money = (k: string, label: string, required = false, hint?: string) => text(k, `${label} (₹)`, { type: 'number', required, hint, step: '0.01' });

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Vehicle">
        <FormGrid cols={3}>
          {create || !disabled ? (
            <Field label="Owner" error={errors.ownerId} required={create}>
              <Select value={ownerId} onChange={(e) => set('ownerId', e.target.value)} disabled={disabled} invalid={!!errors.ownerId}>
                <option value="">Select owner…</option>
                {owners.data?.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.businessName}
                    {o.kycStatus !== 'APPROVED' ? ` (KYC ${o.kycStatus.toLowerCase()})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Category" error={errors.categoryId} required>
            <Select value={String(f.categoryId)} onChange={(e) => set('categoryId', e.target.value)} disabled={disabled} invalid={!!errors.categoryId}>
              <option value="">Select…</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model" error={errors.modelId} required>
            <Select value={String(f.modelId)} onChange={(e) => pickModel(e.target.value)} disabled={disabled} invalid={!!errors.modelId}>
              <option value="">Select…</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.make} {m.name}
                  {!m.isActive ? ' (inactive)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" error={errors.cityId} required>
            <Select value={String(f.cityId)} onChange={(e) => set('cityId', e.target.value)} disabled={disabled} invalid={!!errors.cityId}>
              <option value="">Select…</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">{text('title', 'Listing title', { required: true, placeholder: 'e.g. White Mercedes E-Class – Wedding Special' })}</div>
          {text('registrationNumber', 'Registration no.', { required: true, placeholder: 'OD02AB1234' })}
          {text('year', 'Year', { type: 'number', required: true })}
          {text('color', 'Colour')}
          {text('seats', 'Seats', { type: 'number', required: true })}
          {text('luggageBags', 'Luggage bags', { type: 'number', required: true })}
          <Field label="Fuel" error={errors.fuelType}>
            <Select value={String(f.fuelType)} onChange={(e) => set('fuelType', e.target.value)} disabled={disabled}>
              {FUEL_TYPES.map((x) => (
                <option key={x} value={x}>
                  {FUEL_LABEL[x] ?? x}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transmission" error={errors.transmission}>
            <Select value={String(f.transmission)} onChange={(e) => set('transmission', e.target.value)} disabled={disabled}>
              {TRANSMISSIONS.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver option" error={errors.driverOption}>
            <Select value={String(f.driverOption)} onChange={(e) => set('driverOption', e.target.value)} disabled={disabled}>
              <option value="WITH_DRIVER">With driver</option>
              <option value="SELF_DRIVE">Self drive</option>
              <option value="BOTH">Both</option>
            </Select>
          </Field>
          <Field label="Default driver" error={errors.defaultDriverId} hint={ownerId ? 'Approved drivers of this owner' : 'Select an owner first'}>
            <Select value={String(f.defaultDriverId)} onChange={(e) => set('defaultDriverId', e.target.value)} disabled={disabled || !ownerId}>
              <option value="">None</option>
              {drivers.data?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name ?? d.user.phone}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <div className="mt-4 flex flex-wrap gap-6">
          <Checkbox label="Air conditioned" checked={!!f.hasAc} onChange={(v) => set('hasAc', v)} disabled={disabled} />
          <Checkbox label="Decoration available" checked={!!f.decorationAvailable} onChange={(v) => set('decorationAvailable', v)} disabled={disabled} />
          {!create && <Checkbox label="Featured on website" checked={!!f.isFeatured} onChange={(v) => set('isFeatured', v)} disabled={disabled} />}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Description" error={errors.description}>
            <Textarea rows={5} value={String(f.description)} onChange={(e) => set('description', e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Features" error={errors.features}>
            <ListEditor value={f.features as string[]} onChange={(v) => set('features', v)} disabled={disabled} placeholder="e.g. Leather seats" />
          </Field>
        </div>
      </Section>

      <Section title="Pricing" subtitle="Rates used by the pricing engine. GST is added on top.">
        <FormGrid cols={4}>
          {money('perKmRate', 'Per km', true)}
          {money('perDayRate', 'Per day', true)}
          {money('perHourRate', 'Per hour', true)}
          {text('minBookingHours', 'Min booking hours', { type: 'number' })}
          {text('includedKmPerDay', 'Included km / day', { type: 'number' })}
          {text('includedKmPerHour', 'Included km / hour', { type: 'number' })}
          {money('extraKmRate', 'Extra km rate', true)}
          {money('extraHourRate', 'Extra hour rate', true)}
          {money('driverAllowancePerDay', 'Driver allowance / day')}
          {money('nightChargePerNight', 'Night charge / night')}
          {money('decorationCharge', 'Decoration charge')}
          {money('securityDeposit', 'Security deposit')}
          {money('selfDrivePerDayRate', 'Self-drive / day', false, 'Required for self-drive')}
        </FormGrid>
      </Section>

      <Section title="Compliance" subtitle="Bookings are blocked when a certificate expires before the trip ends.">
        <FormGrid cols={3}>
          {text('insuranceExpiry', 'Insurance expiry', { type: 'date' })}
          {text('fitnessExpiry', 'Fitness expiry', { type: 'date' })}
          {text('pollutionExpiry', 'Pollution (PUC) expiry', { type: 'date' })}
          {text('permitType', 'Permit type', { placeholder: 'e.g. All India Tourist' })}
          {text('permitNumber', 'Permit number')}
          {text('permitExpiry', 'Permit expiry', { type: 'date' })}
        </FormGrid>
      </Section>

      {!disabled && (
        <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-mist-200 bg-mist-50/95 px-1 py-3 backdrop-blur">
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
