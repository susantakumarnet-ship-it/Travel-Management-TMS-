'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useDebounced } from '@/lib/hooks';
import { Select } from '@/components/ui/Field';

/** Debounced search box that syncs to an external value. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  const d = useDebounced(v, 400);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (d !== value) onChange(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9 pr-8" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label="Search" />
      {v && (
        <button type="button" onClick={() => setV('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Filter row: search on the left, filters collapse behind a toggle on mobile. */
export function FilterBar({ search, children, onReset, actions }: { search?: ReactNode; children?: ReactNode; onReset?: () => void; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {search && <div className="min-w-[200px] flex-1 md:max-w-sm">{search}</div>}
        {children && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-mist-300 bg-white px-3 text-sm font-medium text-slate-700 md:hidden">
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        )}
        <div className={clsx('w-full flex-wrap items-center gap-2 md:flex md:w-auto', open ? 'flex' : 'hidden')}>
          {children}
          {onReset && (
            <button type="button" onClick={onReset} className="h-10 px-2 text-sm font-medium text-slate-500 hover:text-navy-800">
              Reset
            </button>
          )}
        </div>
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Compact select for filter bars. */
export function FilterSelect({ value, onChange, options, placeholder, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={clsx('h-10 w-full py-0 md:w-auto md:min-w-[150px]', className)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Pill chips for a single-select status filter. */
export function Chips<T extends string>({ value, onChange, options }: { value: T | ''; onChange: (v: T | '') => void; options: { value: T | ''; label: string; count?: number }[] }) {
  return (
    <div className="scrollbar-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'border-navy-900 bg-navy-900 text-white' : 'border-mist-300 bg-white text-slate-600 hover:border-navy-300 hover:text-navy-800',
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
