'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Plus, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { FUEL_LABEL } from '@/lib/format';
import type { Category, City } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Display';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { dateInput, handleFormError } from './common';
import type { FleetDriver, OwnerVehicle, VehicleModel } from './types';

export type VehicleSection = 'details' | 'pricing' | 'compliance';

const SECTION_FIELDS: Record<VehicleSection, string[]> = {
  details: [
    'categoryId', 'modelId', 'cityId', 'defaultDriverId', 'title', 'registrationNumber', 'year', 'color', 'seats', 'luggageBags',
    'hasAc', 'fuelType', 'transmission', 'driverOption', 'description', 'features', 'decorationAvailable',
  ],
  pricing: [
    'perKmRate', 'perDayRate', 'perHourRate', 'minBookingHours', 'includedKmPerDay', 'includedKmPerHour', 'extraKmRate', 'extraHourRate',
    'driverAllowancePerDay', 'nightChargePerNight', 'decorationCharge', 'securityDeposit', 'selfDrivePerDayRate',
  ],
  compliance: ['insuranceExpiry', 'fitnessExpiry', 'pollutionExpiry', 'permitType', 'permitNumber', 'permitExpiry'],
};
const SECTION_LABEL: Record<VehicleSection, string> = { details: 'Details & specs', pricing: 'Pricing', compliance: 'Compliance' };

const FEATURE_SUGGESTIONS = ['Music system', 'Leather seats', 'Sunroof', 'Reclining seats', 'Phone charger', 'Bottled water', 'First-aid kit', 'GPS', 'Wi-Fi', 'Push-back seats', 'LED TV', 'Carrier'];

interface FormState {
  categoryId: string;
  modelId: string;
  cityId: string;
  defaultDriverId: string;
  title: string;
  registrationNumber: string;
  year: string;
  color: string;
  seats: string;
  luggageBags: string;
  hasAc: boolean;
  fuelType: string;
  transmission: string;
  driverOption: 'WITH_DRIVER' | 'SELF_DRIVE' | 'BOTH';
  description: string;
  features: string[];
  decorationAvailable: boolean;
  insuranceExpiry: string;
  fitnessExpiry: string;
  pollutionExpiry: string;
  permitType: string;
  permitNumber: string;
  permitExpiry: string;
  perKmRate: string;
  perDayRate: string;
  perHourRate: string;
  minBookingHours: string;
  includedKmPerDay: string;
  includedKmPerHour: string;
  extraKmRate: string;
  extraHourRate: string;
  driverAllowancePerDay: string;
  nightChargePerNight: string;
  decorationCharge: string;
  securityDeposit: string;
  selfDrivePerDayRate: string;
}

const s = (v: number | string | null | undefined) => (v == null ? '' : String(v));

function initial(v?: OwnerVehicle): FormState {
  return {
    categoryId: v?.categoryId ?? '',
    modelId: v?.modelId ?? '',
    cityId: v?.cityId ?? '',
    defaultDriverId: v?.defaultDriverId ?? '',
    title: v?.title ?? '',
    registrationNumber: v?.registrationNumber ?? '',
    year: s(v?.year ?? new Date().getFullYear()),
    color: v?.color ?? '',
    seats: s(v?.seats ?? 4),
    luggageBags: s(v?.luggageBags ?? 2),
    hasAc: v?.hasAc ?? true,
    fuelType: v?.fuelType ?? 'DIESEL',
    transmission: v?.transmission ?? 'MANUAL',
    driverOption: v?.driverOption ?? 'WITH_DRIVER',
    description: v?.description ?? '',
    features: v?.features ?? [],
    decorationAvailable: v?.decorationAvailable ?? false,
    insuranceExpiry: dateInput(v?.insuranceExpiry),
    fitnessExpiry: dateInput(v?.fitnessExpiry),
    pollutionExpiry: dateInput(v?.pollutionExpiry),
    permitType: v?.permitType ?? '',
    permitNumber: v?.permitNumber ?? '',
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

const NUM_FIELDS = new Set([
  'year', 'seats', 'luggageBags', 'perKmRate', 'perDayRate', 'perHourRate', 'minBookingHours', 'includedKmPerDay', 'includedKmPerHour',
  'extraKmRate', 'extraHourRate', 'driverAllowancePerDay', 'nightChargePerNight', 'decorationCharge', 'securityDeposit',
]);
const NULLABLE = new Set(['defaultDriverId', 'insuranceExpiry', 'fitnessExpiry', 'pollutionExpiry', 'permitType', 'permitNumber', 'permitExpiry', 'selfDrivePerDayRate']);

function toPayload(f: FormState) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (k === 'selfDrivePerDayRate') out[k] = t === '' ? null : Number(t);
      else if (NUM_FIELDS.has(k)) out[k] = t === '' ? undefined : Number(t);
      else if (NULLABLE.has(k)) out[k] = t === '' ? null : t;
      else out[k] = t === '' ? undefined : t;
    } else out[k] = v;
  }
  return out;
}

/**
 * Create / edit a vehicle. With `section` set, only that section is visible (the rest stay mounted so
 * unsaved edits survive tab switches); saving always sends the complete form.
 */
export function VehicleForm({ vehicle, section, onSaved, onSectionError }: { vehicle?: OwnerVehicle; section?: VehicleSection; onSaved: (v: OwnerVehicle) => void; onSectionError?: (s: VehicleSection) => void }) {
  const [f, setF] = useState<FormState>(() => initial(vehicle));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState('');

  const cats = useApi<Category[]>('/public/categories');
  const cities = useApi<City[]>('/public/cities');
  const drivers = useApi<FleetDriver[]>('/owner/drivers');
  const models = useApi<VehicleModel[]>(f.categoryId ? '/public/models' : null, { query: { categoryId: f.categoryId } });

  useEffect(() => {
    if (vehicle) setF(initial(vehicle));
  }, [vehicle]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  function pickModel(id: string) {
    const m = models.data?.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      modelId: id,
      ...(m
        ? {
            seats: String(m.seats),
            luggageBags: String(m.luggageBags),
            fuelType: m.fuelType,
            transmission: m.transmission,
            title: p.title.trim() ? p.title : `${m.make} ${m.name}`,
          }
        : {}),
    }));
    setErrors((e) => ({ ...e, modelId: '' }));
  }

  function addFeature(v: string) {
    const t = v.trim();
    if (!t || f.features.includes(t) || f.features.length >= 30) return;
    set('features', [...f.features, t]);
    setFeatureInput('');
  }

  const errorSections = useMemo(
    () => (Object.keys(SECTION_FIELDS) as VehicleSection[]).filter((sec) => SECTION_FIELDS[sec].some((k) => errors[k])),
    [errors],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.categoryId) local.categoryId = 'Select a category';
    if (!f.modelId) local.modelId = 'Select a model';
    if (!f.cityId) local.cityId = 'Select a city';
    for (const k of ['perKmRate', 'perDayRate', 'perHourRate', 'extraKmRate', 'extraHourRate'] as const) if (f[k].trim() === '') local[k] = 'Required';
    if (f.driverOption !== 'WITH_DRIVER' && !f.selfDrivePerDayRate.trim() && !f.perDayRate.trim()) local.selfDrivePerDayRate = 'Set a self-drive day rate';
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error('Please fill in the required fields');
      const first = (Object.keys(SECTION_FIELDS) as VehicleSection[]).find((sec) => SECTION_FIELDS[sec].some((k) => local[k]));
      if (first && section && first !== section) onSectionError?.(first);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const body = toPayload(f);
      const saved = vehicle
        ? await api<OwnerVehicle>(`/owner/vehicles/${vehicle.id}`, { method: 'PUT', body })
        : await api<OwnerVehicle>('/owner/vehicles', { method: 'POST', body });
      toast.success(vehicle ? 'Vehicle updated' : 'Vehicle submitted for approval');
      onSaved(saved);
    } catch (err) {
      const msg = handleFormError(err, (fe) => {
        setErrors(fe);
        const first = (Object.keys(SECTION_FIELDS) as VehicleSection[]).find((sec) => SECTION_FIELDS[sec].some((k) => fe[k]));
        if (first && section && first !== section) onSectionError?.(first);
      });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const show = (sec: VehicleSection) => !section || section === sec;
  const num = (k: keyof FormState, label: string, hint: string, opts: { prefix?: string; required?: boolean; step?: string } = {}) => (
    <Field label={label} hint={hint} error={errors[k]} required={opts.required}>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={opts.step ?? 'any'}
        value={f[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
        invalid={!!errors[k]}
        leading={opts.prefix ? <span className="text-sm font-semibold">{opts.prefix}</span> : undefined}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* ───── Details ───── */}
      <div className={clsx('space-y-6', !show('details') && 'hidden')}>
        <Card>
          <CardHeader title="Vehicle identity" subtitle="Changing the registration number or model of an approved vehicle sends it back for re-verification." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Category" required error={errors.categoryId}>
              <Select value={f.categoryId} onChange={(e) => setF((p) => ({ ...p, categoryId: e.target.value, modelId: '' }))} invalid={!!errors.categoryId}>
                <option value="">{cats.loading ? 'Loading…' : 'Select category'}</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Make & model" required error={errors.modelId} hint={!f.categoryId ? 'Choose a category first' : models.data && !models.data.length ? 'No models listed for this category — contact support' : undefined}>
              <Select value={f.modelId} onChange={(e) => pickModel(e.target.value)} disabled={!f.categoryId} invalid={!!errors.modelId}>
                <option value="">{models.loading ? 'Loading…' : 'Select model'}</option>
                {models.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.make} {m.name}
                  </option>
                ))}
                {vehicle && f.modelId === vehicle.modelId && !models.data?.some((m) => m.id === vehicle.modelId) && (
                  <option value={vehicle.modelId}>
                    {vehicle.model.make} {vehicle.model.name}
                  </option>
                )}
              </Select>
            </Field>
            <Field label="Operating city" required error={errors.cityId}>
              <Select value={f.cityId} onChange={(e) => set('cityId', e.target.value)} invalid={!!errors.cityId}>
                <option value="">{cities.loading ? 'Loading…' : 'Select city'}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.state}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Listing title" required error={errors.title} hint="Shown to customers, e.g. “Toyota Innova Crysta – Wedding White”" className="sm:col-span-2">
              <Input value={f.title} maxLength={160} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />
            </Field>
            <Field label="Registration number" required error={errors.registrationNumber} hint="e.g. OD02AB1234">
              <Input value={f.registrationNumber} maxLength={15} onChange={(e) => set('registrationNumber', e.target.value.toUpperCase())} invalid={!!errors.registrationNumber} className="font-mono uppercase" />
            </Field>
            <Field label="Year" required error={errors.year}>
              <Input type="number" min={1950} max={new Date().getFullYear() + 1} value={f.year} onChange={(e) => set('year', e.target.value)} invalid={!!errors.year} />
            </Field>
            <Field label="Colour" error={errors.color}>
              <Input value={f.color} maxLength={40} onChange={(e) => set('color', e.target.value)} placeholder="e.g. Pearl white" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Specifications" subtitle="Pre-filled from the model — adjust to match your vehicle." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Seats (excl. driver)" required error={errors.seats}>
              <Input type="number" min={1} max={60} value={f.seats} onChange={(e) => set('seats', e.target.value)} invalid={!!errors.seats} />
            </Field>
            <Field label="Luggage bags" required error={errors.luggageBags}>
              <Input type="number" min={0} max={40} value={f.luggageBags} onChange={(e) => set('luggageBags', e.target.value)} invalid={!!errors.luggageBags} />
            </Field>
            <Field label="Fuel" required error={errors.fuelType}>
              <Select value={f.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
                {Object.entries(FUEL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Transmission" required error={errors.transmission}>
              <Select value={f.transmission} onChange={(e) => set('transmission', e.target.value)}>
                <option value="MANUAL">Manual</option>
                <option value="AUTOMATIC">Automatic</option>
              </Select>
            </Field>
            <Field label="Driver option" required error={errors.driverOption} className="sm:col-span-2">
              <Select value={f.driverOption} onChange={(e) => set('driverOption', e.target.value as FormState['driverOption'])}>
                <option value="WITH_DRIVER">With driver only</option>
                <option value="SELF_DRIVE">Self-drive only</option>
                <option value="BOTH">Both (with driver or self-drive)</option>
              </Select>
            </Field>
            <Field label="Default driver" error={errors.defaultDriverId} hint="Pre-selected when assigning trips. Link drivers under Fleet drivers." className="sm:col-span-2">
              <Select value={f.defaultDriverId} onChange={(e) => set('defaultDriverId', e.target.value)}>
                <option value="">None</option>
                {drivers.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user.name ?? d.user.phone} {d.verificationStatus !== 'APPROVED' ? '(not verified)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-6">
            <Checkbox label="Air-conditioned" checked={f.hasAc} onChange={(v) => set('hasAc', v)} />
            <Checkbox label="Wedding decoration available" description="Customers can add flower decoration (set the charge under Pricing)." checked={f.decorationAvailable} onChange={(v) => set('decorationAvailable', v)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Description & features" />
          <Field label="Description" error={errors.description} hint="Condition, comfort, what makes this vehicle special.">
            <Textarea value={f.description} maxLength={4000} onChange={(e) => set('description', e.target.value)} rows={4} />
          </Field>
          <div className="mt-5">
            <span className="label">Features</span>
            <div className="mb-3 flex flex-wrap gap-2">
              {f.features.map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-white">
                  {x}
                  <button type="button" onClick={() => set('features', f.features.filter((y) => y !== x))} aria-label={`Remove ${x}`} className="rounded-full p-0.5 hover:bg-white/20">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {!f.features.length && <span className="text-sm text-slate-400">No features added yet.</span>}
            </div>
            <div className="flex gap-2">
              <Input
                value={featureInput}
                maxLength={60}
                placeholder="Add a feature and press Enter"
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFeature(featureInput);
                  }
                }}
              />
              <Button variant="outline" onClick={() => addFeature(featureInput)} icon={<Plus className="h-4 w-4" />}>
                Add
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {FEATURE_SUGGESTIONS.filter((x) => !f.features.includes(x)).map((x) => (
                <button key={x} type="button" onClick={() => addFeature(x)} className="rounded-full border border-dashed border-mist-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-gold-500 hover:text-navy-900">
                  + {x}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ───── Pricing ───── */}
      <div className={clsx('space-y-6', !show('pricing') && 'hidden')}>
        <Card>
          <CardHeader title="Base rates" subtitle="Customers see an instant quote built from these rates. GST and platform commission are applied on top/deducted automatically." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num('perKmRate', 'Per km rate', 'Outstation trips are billed per km (minimum km/day applies).', { prefix: '₹', required: true })}
            {num('perDayRate', 'Per day rate', 'Daily rental / multi-day bookings and wedding days.', { prefix: '₹', required: true })}
            {num('perHourRate', 'Per hour rate', 'Local hourly packages within the city.', { prefix: '₹', required: true })}
            {num('minBookingHours', 'Minimum booking hours', 'Shortest local package you accept (1–24).', { step: '1' })}
            {num('includedKmPerDay', 'Included km per day', 'Free km per day on daily rentals; also the outstation daily minimum.', { step: '1' })}
            {num('includedKmPerHour', 'Included km per hour', 'Free km per booked hour on local packages.', { step: '1' })}
          </div>
        </Card>
        <Card>
          <CardHeader title="Extras & allowances" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num('extraKmRate', 'Extra km rate', 'Charged per km beyond the included distance.', { prefix: '₹', required: true })}
            {num('extraHourRate', 'Extra hour rate', 'Charged per hour beyond the booked time (30-min grace).', { prefix: '₹', required: true })}
            {num('driverAllowancePerDay', 'Driver allowance / day', 'Driver bata added per trip day.', { prefix: '₹' })}
            {num('nightChargePerNight', 'Night charge / night', 'For trips running past 10 PM or overnight.', { prefix: '₹' })}
            {num('decorationCharge', 'Decoration charge', 'Flower decoration for weddings (if available).', { prefix: '₹' })}
            {num('securityDeposit', 'Security deposit', 'Refundable deposit collected at pickup (mainly self-drive).', { prefix: '₹' })}
            {f.driverOption !== 'WITH_DRIVER' && num('selfDrivePerDayRate', 'Self-drive per day rate', 'Daily rate when the customer drives. Leave blank to use the per-day rate.', { prefix: '₹' })}
          </div>
        </Card>
      </div>

      {/* ───── Compliance ───── */}
      <div className={clsx('space-y-6', !show('compliance') && 'hidden')}>
        <Card>
          <CardHeader title="Compliance" subtitle="We remind you before documents expire. Vehicles with expired documents may be paused." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DateField label="Insurance valid until" value={f.insuranceExpiry} onChange={(v) => set('insuranceExpiry', v)} error={errors.insuranceExpiry} />
            <DateField label="Fitness valid until" value={f.fitnessExpiry} onChange={(v) => set('fitnessExpiry', v)} error={errors.fitnessExpiry} />
            <DateField label="PUC valid until" value={f.pollutionExpiry} onChange={(v) => set('pollutionExpiry', v)} error={errors.pollutionExpiry} />
            <Field label="Permit type" error={errors.permitType} hint="e.g. All India Tourist, State contract carriage">
              <Input value={f.permitType} maxLength={40} onChange={(e) => set('permitType', e.target.value)} />
            </Field>
            <Field label="Permit number" error={errors.permitNumber}>
              <Input value={f.permitNumber} maxLength={40} onChange={(e) => set('permitNumber', e.target.value.toUpperCase())} />
            </Field>
            <DateField label="Permit valid until" value={f.permitExpiry} onChange={(v) => set('permitExpiry', v)} error={errors.permitExpiry} />
          </div>
        </Card>
      </div>

      {errorSections.length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Please fix errors in:{' '}
          {errorSections.map((sec, i) => (
            <span key={sec}>
              {i > 0 && ', '}
              {section && onSectionError ? (
                <button type="button" className="font-semibold underline" onClick={() => onSectionError(sec)}>
                  {SECTION_LABEL[sec]}
                </button>
              ) : (
                <strong>{SECTION_LABEL[sec]}</strong>
              )}
            </span>
          ))}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-mist-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" variant="gold" size="lg" loading={saving} icon={<Save className="h-4 w-4" />}>
          {vehicle ? 'Save changes' : 'Submit for approval'}
        </Button>
      </div>
    </form>
  );
}

function DateField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }): ReactNode {
  const past = value && new Date(value) < new Date(new Date().toISOString().slice(0, 10));
  return (
    <Field label={label} error={error} hint={past ? 'This date is in the past — renew and update.' : undefined}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error || !!past} />
    </Field>
  );
}
