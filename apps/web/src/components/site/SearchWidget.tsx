'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Navigation, Search } from 'lucide-react';
import { combineIst, istToday, PURPOSE_LABEL } from '@/lib/format';
import type { Category, TravelPurpose } from '@/lib/types';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Field';
import { isoToIstParts, toQueryString } from './searchParams';

export interface SearchInitial {
  pickupLocation?: string;
  dropLocation?: string;
  pickupAt?: string;
  returnAt?: string;
  purpose?: string;
  category?: string;
  passengers?: string;
  luggage?: string;
  ac?: string;
  withDriver?: string;
}

export function SearchWidget({ categories, initial = {}, className, dark }: { categories: Category[]; initial?: SearchInitial; className?: string; dark?: boolean }) {
  const router = useRouter();
  const p0 = isoToIstParts(initial.pickupAt);
  const r0 = isoToIstParts(initial.returnAt);
  const [f, setF] = useState({
    pickupLocation: initial.pickupLocation ?? '',
    dropLocation: initial.dropLocation ?? '',
    pickupDate: p0.date || istToday(1),
    pickupTime: p0.time || '09:00',
    returnDate: r0.date || istToday(1),
    returnTime: r0.time || '21:00',
    purpose: initial.purpose ?? '',
    category: initial.category ?? '',
    passengers: initial.passengers ?? '',
    luggage: initial.luggage ?? '',
    ac: (initial.ac ?? 'any') as 'any' | 'true' | 'false',
    withDriver: (initial.withDriver ?? 'true') as 'true' | 'false',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.pickupDate || !f.pickupTime) errs.pickup = 'Choose pickup date & time';
    if (!f.returnDate || !f.returnTime) errs.return = 'Choose return date & time';
    let pickupAt = '';
    let returnAt = '';
    if (!errs.pickup && !errs.return) {
      pickupAt = combineIst(f.pickupDate, f.pickupTime);
      returnAt = combineIst(f.returnDate, f.returnTime);
      if (new Date(pickupAt).getTime() < Date.now()) errs.pickup = 'Pickup must be in the future';
      if (new Date(returnAt) <= new Date(pickupAt)) errs.return = 'Return must be after pickup';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    router.push(
      '/vehicles' +
        toQueryString({
          pickupLocation: f.pickupLocation.trim(),
          dropLocation: f.dropLocation.trim(),
          pickupAt,
          returnAt,
          purpose: f.purpose,
          category: f.category,
          passengers: f.passengers,
          luggage: f.luggage,
          ac: f.ac === 'any' ? '' : f.ac,
          withDriver: f.withDriver,
        }),
    );
  }

  return (
    <form onSubmit={submit} className={clsx('rounded-3xl bg-white p-4 shadow-lift ring-1 ring-black/5 md:p-6', className)} aria-label="Search vehicles">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Pickup location">
          <Input leading={<MapPin className="h-4 w-4" />} placeholder="e.g. Bhubaneswar Airport" value={f.pickupLocation} onChange={(e) => set('pickupLocation', e.target.value)} maxLength={300} />
        </Field>
        <Field label="Drop location">
          <Input leading={<Navigation className="h-4 w-4" />} placeholder="e.g. Puri" value={f.dropLocation} onChange={(e) => set('dropLocation', e.target.value)} maxLength={300} />
        </Field>
        <Field label="Pickup date & time" error={errors.pickup}>
          <div className="flex gap-2">
            <Input type="date" aria-label="Pickup date" min={istToday()} value={f.pickupDate} onChange={(e) => { set('pickupDate', e.target.value); if (f.returnDate < e.target.value) set('returnDate', e.target.value); }} invalid={!!errors.pickup} className="min-w-0" />
            <Input type="time" aria-label="Pickup time" value={f.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} invalid={!!errors.pickup} className="w-[132px] shrink-0" />
          </div>
        </Field>
        <Field label="Return date & time" error={errors.return}>
          <div className="flex gap-2">
            <Input type="date" aria-label="Return date" min={f.pickupDate || istToday()} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} invalid={!!errors.return} className="min-w-0" />
            <Input type="time" aria-label="Return time" value={f.returnTime} onChange={(e) => set('returnTime', e.target.value)} invalid={!!errors.return} className="w-[132px] shrink-0" />
          </div>
        </Field>
        <Field label="Travel purpose">
          <Select value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
            <option value="">Any purpose</option>
            {(Object.keys(PURPOSE_LABEL) as TravelPurpose[]).map((p) => (
              <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle category">
          <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Passengers">
            <Input type="number" inputMode="numeric" min={1} max={60} placeholder="2" value={f.passengers} onChange={(e) => set('passengers', e.target.value)} />
          </Field>
          <Field label="Luggage">
            <Input type="number" inputMode="numeric" min={0} max={40} placeholder="1" value={f.luggage} onChange={(e) => set('luggage', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">AC</span>
            <Segmented className="w-full [&>button]:flex-1" value={f.ac} onChange={(v) => set('ac', v)} options={[{ value: 'any', label: 'Any' }, { value: 'true', label: 'AC' }, { value: 'false', label: 'Non' }]} />
          </div>
          <div>
            <span className="label">Driver</span>
            <Segmented className="w-full [&>button]:flex-1" value={f.withDriver} onChange={(v) => set('withDriver', v)} options={[{ value: 'true', label: 'With' }, { value: 'false', label: 'Self' }]} />
          </div>
        </div>
      </div>
      <div className={clsx('mt-4 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center', dark && 'text-white')}>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <CalendarDays className="h-4 w-4 text-gold-600" /> Live availability & instant price estimate for your dates. Times in IST.
        </p>
        <Button type="submit" variant="gold" size="lg" icon={<Search className="h-5 w-5" />} className="sm:min-w-[220px]">
          Search vehicles <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
