'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, Skeleton, type Tone } from '@/components/ui/Display';
import { titleCase } from '@/lib/format';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-800">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}

/** Badge for any enum value with a tone map. */
export function EnumBadge({ value, tones, label }: { value: string | null | undefined; tones: Record<string, Tone>; label?: string }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <Badge tone={tones[value] ?? 'gray'}>{label ?? titleCase(value)}</Badge>;
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-navy-900' : 'bg-mist-300')}
    >
      <span className={clsx('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Card with a title row — the standard detail-page section. */
export function Section({ title, subtitle, action, children, className, padded = true }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <Card className={className} padded={padded}>
      <div className={clsx('mb-4 flex flex-wrap items-start justify-between gap-3', !padded && 'px-5 pt-5')}>
        <div>
          <h3 className="text-base font-semibold text-navy-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Two-line cell: primary + muted secondary text. */
export function Cell({ primary, secondary, href }: { primary: ReactNode; secondary?: ReactNode; href?: string }) {
  const p = <span className="font-medium text-navy-900">{primary}</span>;
  return (
    <div className="min-w-0">
      {href ? (
        <Link href={href} className="hover:underline">
          {p}
        </Link>
      ) : (
        p
      )}
      {secondary && <div className="truncate text-xs text-slate-500">{secondary}</div>}
    </div>
  );
}

export function ReadOnlyNotice({ module }: { module: string }) {
  return <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">You have read-only access to {module}.</p>;
}

/** Labelled grid of form fields. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={clsx('grid gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3', cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4')}>{children}</div>;
}
