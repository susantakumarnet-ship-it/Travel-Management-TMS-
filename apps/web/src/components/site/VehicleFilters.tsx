'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { CalendarDays, Edit3, MapPin, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { Category, City, TravelPurpose } from '@/lib/types';
import { fmtDateTime, PURPOSE_LABEL } from '@/lib/format';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useSearchNav } from './SearchNav';
import { SearchWidget } from './SearchWidget';

const FILTER_KEYS = ['city', 'category', 'purpose', 'passengers', 'luggage', 'ac', 'withDriver', 'fuel', 'transmission', 'decoration', 'minPrice', 'maxPrice', 'q'];

export function VehicleFilters({ categories, cities }: { categories: Category[]; cities: City[] }) {
  const { params, update } = useSearchNav();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState({ q: params.q ?? '', minPrice: params.minPrice ?? '', maxPrice: params.maxPrice ?? '', passengers: params.passengers ?? '', luggage: params.luggage ?? '' });

  useEffect(() => {
    setText({ q: params.q ?? '', minPrice: params.minPrice ?? '', maxPrice: params.maxPrice ?? '', passengers: params.passengers ?? '', luggage: params.luggage ?? '' });
  }, [params.q, params.minPrice, params.maxPrice, params.passengers, params.luggage]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const activeCount = FILTER_KEYS.filter((k) => params[k]).length;

  function applyText(e?: React.FormEvent) {
    e?.preventDefault();
    update({ q: text.q.trim(), minPrice: text.minPrice, maxPrice: text.maxPrice, passengers: text.passengers, luggage: text.luggage });
    setOpen(false);
  }
  function reset() {
    const patch: Record<string, undefined> = {};
    for (const k of FILTER_KEYS) patch[k] = undefined;
    patch.sort = undefined;
    update(patch);
    setOpen(false);
  }

  const panel = (
    <form onSubmit={applyText} className="space-y-5">
      <Field label="Search by name">
        <Input value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} placeholder="e.g. Innova, Fortuner" maxLength={80} />
      </Field>
      {cities.length > 1 && (
        <Field label="City">
          <Select value={params.city ?? ''} onChange={(e) => update({ city: e.target.value })}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <div>
        <span className="label">Category</span>
        <div className="flex flex-wrap gap-2">
          <Chip active={!params.category} onClick={() => update({ category: undefined })}>All</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={params.category === c.slug} onClick={() => update({ category: c.slug })}>{c.name}</Chip>
          ))}
        </div>
      </div>
      <Field label="Travel purpose">
        <Select value={params.purpose ?? ''} onChange={(e) => update({ purpose: e.target.value })}>
          <option value="">Any</option>
          {(Object.keys(PURPOSE_LABEL) as TravelPurpose[]).map((p) => (
            <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min. seats">
          <Input type="number" min={1} max={60} value={text.passengers} onChange={(e) => setText({ ...text, passengers: e.target.value })} />
        </Field>
        <Field label="Min. bags">
          <Input type="number" min={0} max={40} value={text.luggage} onChange={(e) => setText({ ...text, luggage: e.target.value })} />
        </Field>
      </div>
      <TriState label="Air conditioning" value={params.ac} onChange={(v) => update({ ac: v })} options={[['true', 'AC'], ['false', 'Non-AC']]} />
      <TriState label="Driver" value={params.withDriver} onChange={(v) => update({ withDriver: v })} options={[['true', 'With driver'], ['false', 'Self drive']]} />
      <Field label="Fuel">
        <Select value={params.fuel ?? ''} onChange={(e) => update({ fuel: e.target.value })}>
          <option value="">Any fuel</option>
          <option value="PETROL">Petrol</option>
          <option value="DIESEL">Diesel</option>
          <option value="CNG">CNG</option>
          <option value="ELECTRIC">Electric</option>
          <option value="HYBRID">Hybrid</option>
        </Select>
      </Field>
      <TriState label="Transmission" value={params.transmission} onChange={(v) => update({ transmission: v })} options={[['MANUAL', 'Manual'], ['AUTOMATIC', 'Automatic']]} />
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-mist-200 px-3 py-2.5">
        <span className="text-sm font-medium text-slate-800">Wedding decoration available</span>
        <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={params.decoration === 'true'} onChange={(e) => update({ decoration: e.target.checked ? 'true' : undefined })} />
      </label>
      <div>
        <span className="label">Per-day price (₹)</span>
        <div className="grid grid-cols-2 gap-3">
          <Input type="number" min={0} placeholder="Min" aria-label="Minimum price per day" value={text.minPrice} onChange={(e) => setText({ ...text, minPrice: e.target.value })} />
          <Input type="number" min={0} placeholder="Max" aria-label="Maximum price per day" value={text.maxPrice} onChange={(e) => setText({ ...text, maxPrice: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply</Button>
        <Button type="button" variant="outline" onClick={reset} icon={<RotateCcw className="h-4 w-4" />}>Reset</Button>
      </div>
    </form>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-mist-300 bg-white px-4 py-2 text-sm font-semibold text-navy-900 lg:hidden"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" /> Filters
        {activeCount > 0 && <span className="rounded-full bg-gold-500 px-1.5 text-xs text-navy-950">{activeCount}</span>}
      </button>
      <aside className="hidden lg:block">
        <div className="card sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto p-5 scrollbar-thin">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy-900">
            <SlidersHorizontal className="h-4 w-4 text-gold-600" /> Filters
          </h2>
          {panel}
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white shadow-lift animate-fade-up">
            <div className="flex items-center justify-between border-b border-mist-200 px-4 py-3">
              <h2 className="font-semibold text-navy-900">Filters</h2>
              <button onClick={() => setOpen(false)} aria-label="Close filters" className="rounded-lg p-2 hover:bg-mist-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{panel}</div>
          </div>
        </div>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold transition', active ? 'bg-navy-900 text-white' : 'bg-mist-100 text-slate-700 hover:bg-mist-200')}>
      {children}
    </button>
  );
}

function TriState({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: [string, string][] }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        <Chip active={!value} onClick={() => onChange(undefined)}>Any</Chip>
        {options.map(([v, l]) => (
          <Chip key={v} active={value === v} onClick={() => onChange(v)}>{l}</Chip>
        ))}
      </div>
    </div>
  );
}

/** Journey summary with a "Modify" toggle that reveals the full search widget. */
export function JourneyBar({ categories }: { categories: Category[] }) {
  const { params } = useSearchNav();
  const [editing, setEditing] = useState(!params.pickupAt);
  useEffect(() => {
    setEditing(!params.pickupAt);
  }, [params.pickupAt, params.returnAt]);
  return (
    <div className="mb-6">
      {!editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy-900 px-4 py-3 text-white shadow-card md:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            {(params.pickupLocation || params.dropLocation) && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold-400" />
                {params.pickupLocation || 'Any pickup'} {params.dropLocation && <>→ {params.dropLocation}</>}
              </span>
            )}
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gold-400" />
              {fmtDateTime(params.pickupAt)} – {fmtDateTime(params.returnAt)}
            </span>
            {params.purpose && <span className="text-navy-200">{PURPOSE_LABEL[params.purpose as TravelPurpose] ?? params.purpose}</span>}
          </div>
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">
            <Edit3 className="h-4 w-4" /> Modify
          </button>
        </div>
      )}
      {editing && (
        <div className="animate-fade-up">
          {!params.pickupAt && <p className="mb-3 text-sm text-slate-600">Add your dates to see live availability and the estimated total for each vehicle.</p>}
          <SearchWidget categories={categories} initial={params} className="!shadow-card" />
          {params.pickupAt && (
            <button className="mt-2 text-sm font-semibold text-navy-600 hover:underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
