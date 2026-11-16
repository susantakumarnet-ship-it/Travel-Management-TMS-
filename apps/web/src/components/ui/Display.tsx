'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import type { BookingStatus } from '@/lib/types';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';

// ───────────── Card ─────────────
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={clsx('card', padded && 'p-5 md:p-6', className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-navy-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ───────────── Badge ─────────────
export type Tone = 'gray' | 'amber' | 'blue' | 'indigo' | 'violet' | 'green' | 'red' | 'gold' | 'navy';
const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-200',
  navy: 'bg-navy-900 text-white ring-navy-900',
};
export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}
export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

// ───────────── Modal ─────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift animate-fade-up sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b border-mist-200 px-5 py-4">
          <h3 className="text-base font-semibold text-navy-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-mist-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-mist-200 bg-mist-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────── Feedback ─────────────
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-mist-300 bg-mist-50 px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-white p-3 text-navy-400 shadow-sm">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('relative overflow-hidden rounded-lg bg-mist-200 before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent', className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

// ───────────── Stat card ─────────────
export function StatCard({ label, value, icon, hint, tone = 'navy', href }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' | 'amber' | 'blue'; href?: string }) {
  const iconTone = { navy: 'bg-navy-50 text-navy-700', gold: 'bg-gold-50 text-gold-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700' }[tone];
  const body = (
    <div className="card flex items-start gap-4 p-5 transition hover:shadow-lift">
      {icon && <div className={clsx('rounded-xl p-2.5', iconTone)}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold text-navy-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// ───────────── Page header ─────────────
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 md:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ───────────── Tabs ─────────────
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="scrollbar-thin -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-mist-200 px-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx('relative whitespace-nowrap px-3 pb-3 pt-1 text-sm font-semibold transition', value === t.value ? 'text-navy-900' : 'text-slate-500 hover:text-navy-700')}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-mist-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold-500" />}
        </button>
      ))}
    </div>
  );
}

// ───────────── Pagination ─────────────
export function Pagination({ page, totalPages, onChange, total }: { page: number; totalPages: number; onChange: (p: number) => void; total?: number }) {
  if (totalPages <= 1) return total != null ? <p className="mt-4 text-xs text-slate-500">{total} result{total === 1 ? '' : 's'}</p> : null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {totalPages}
        {total != null && ` · ${total} results`}
      </span>
      <div className="flex gap-1">
        <button className="rounded-lg border border-mist-300 p-2 hover:bg-mist-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-mist-300 p-2 hover:bg-mist-50 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ───────────── Key/value list ─────────────
export function DL({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3 text-sm', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
