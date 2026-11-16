'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import type { City } from '@/lib/types';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { dateInput } from './common';
import type { DriverProfile } from './types';

export interface DriverForm {
  name: string;
  email: string;
  licenceNumber: string;
  licenceExpiry: string;
  experienceYears: string;
  languages: string[];
  dateOfBirth: string;
  address: string;
  cityId: string;
}

export function driverFormFrom(p: DriverProfile | null, fallbackName?: string | null): DriverForm {
  return {
    name: p?.user.name ?? fallbackName ?? '',
    email: p?.user.email ?? '',
    licenceNumber: p?.licenceNumber ?? '',
    licenceExpiry: dateInput(p?.licenceExpiry),
    experienceYears: p ? String(p.experienceYears) : '',
    languages: p?.languages ?? ['Odia', 'Hindi'],
    dateOfBirth: dateInput(p?.dateOfBirth),
    address: p?.address ?? '',
    cityId: p?.cityId ?? '',
  };
}

export function driverPayload(f: DriverForm) {
  return {
    name: f.name.trim(),
    email: f.email.trim(),
    licenceNumber: f.licenceNumber.trim(),
    licenceExpiry: f.licenceExpiry,
    experienceYears: Number(f.experienceYears || 0),
    languages: f.languages,
    dateOfBirth: f.dateOfBirth || undefined,
    address: f.address.trim() || undefined,
    cityId: f.cityId || undefined,
  };
}

const LANGS = ['Odia', 'Hindi', 'English', 'Bengali', 'Telugu'];

/** Registration fields for drivers (large inputs for phones). */
export function DriverFields({ form, set, errors }: { form: DriverForm; set: <K extends keyof DriverForm>(k: K, v: DriverForm[K]) => void; errors: Record<string, string> }) {
  const cities = useApi<City[]>('/public/cities');
  const [custom, setCustom] = useState('');
  const toggle = (l: string) => set('languages', form.languages.includes(l) ? form.languages.filter((x) => x !== l) : [...form.languages, l].slice(0, 8));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full name (as on licence)" required error={errors.name} className="sm:col-span-2">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoComplete="name" className="h-12 text-base" />
      </Field>
      <Field label="Driving licence number" required error={errors.licenceNumber} hint="e.g. OD02 20190012345">
        <Input value={form.licenceNumber} onChange={(e) => set('licenceNumber', e.target.value.toUpperCase())} invalid={!!errors.licenceNumber} className="h-12 font-mono text-base uppercase" />
      </Field>
      <Field label="Licence valid until" required error={errors.licenceExpiry}>
        <Input type="date" value={form.licenceExpiry} onChange={(e) => set('licenceExpiry', e.target.value)} invalid={!!errors.licenceExpiry} className="h-12 text-base" />
      </Field>
      <Field label="Driving experience (years)" required error={errors.experienceYears}>
        <Input type="number" inputMode="numeric" min={0} max={50} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} invalid={!!errors.experienceYears} className="h-12 text-base" />
      </Field>
      <Field label="Date of birth" error={errors.dateOfBirth} hint="You must be at least 21">
        <Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} invalid={!!errors.dateOfBirth} className="h-12 text-base" />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input type="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} className="h-12 text-base" />
      </Field>
      <Field label="Base city" error={errors.cityId}>
        <Select value={form.cityId} onChange={(e) => set('cityId', e.target.value)} className="h-12 text-base">
          <option value="">Select city</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Address" error={errors.address} className="sm:col-span-2">
        <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} className="text-base" />
      </Field>
      <div className="sm:col-span-2">
        <span className="label">Languages you speak</span>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...LANGS, ...form.languages])].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => toggle(l)}
              aria-pressed={form.languages.includes(l)}
              className={clsx('h-11 rounded-full border px-4 text-sm font-semibold transition', form.languages.includes(l) ? 'border-navy-900 bg-navy-900 text-white' : 'border-mist-300 bg-white text-slate-600')}
            >
              {l}
            </button>
          ))}
          <Input
            value={custom}
            maxLength={30}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const t = custom.trim();
              if (t && !form.languages.includes(t)) set('languages', [...form.languages, t].slice(0, 8));
              setCustom('');
            }}
            placeholder="Other + Enter"
            className="h-11 w-36"
          />
        </div>
        {errors.languages && <p className="mt-1 text-xs font-medium text-red-600">{errors.languages}</p>}
      </div>
    </div>
  );
}
