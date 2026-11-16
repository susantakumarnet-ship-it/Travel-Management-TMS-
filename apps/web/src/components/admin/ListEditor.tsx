'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

/** Editor for a list of short strings (highlights, inclusions, features…). */
export function ListEditor({ value, onChange, placeholder = 'Add item and press Enter', max = 30, disabled }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || value.length >= max) return;
    onChange([...value, v]);
    setDraft('');
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="divide-y divide-mist-100 rounded-lg border border-mist-200">
          {value.map((item, i) => (
            <li key={`${i}-${item}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <input
                className="min-w-0 flex-1 bg-transparent py-1 outline-none"
                value={item}
                disabled={disabled}
                onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))}
                aria-label={`Item ${i + 1}`}
              />
              {!disabled && (
                <>
                  <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-navy-800 disabled:opacity-30" disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-navy-800 disabled:opacity-30" disabled={i === value.length - 1} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && value.length < max && (
        <div className="flex gap-2">
          <input
            className="input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} className="inline-flex h-[42px] items-center gap-1 rounded-lg border border-mist-300 px-3 text-sm font-semibold text-navy-800 hover:bg-mist-50">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      )}
    </div>
  );
}
