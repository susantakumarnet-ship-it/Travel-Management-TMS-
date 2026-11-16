'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Star } from 'lucide-react';
import { toast } from 'sonner';

/** Read-only star rating. */
export function Stars({ value, className, size = 'sm' }: { value: number; className?: string; size?: 'sm' | 'md' }) {
  const s = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={clsx(s, i <= Math.round(value) ? 'fill-gold-400 text-gold-400' : 'fill-mist-200 text-mist-200')} />
      ))}
    </span>
  );
}

/** 1–5 star input. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className="rounded p-0.5 transition hover:scale-110"
          >
            <Star className={clsx('h-7 w-7', i <= (hover || value) ? 'fill-gold-400 text-gold-400' : 'fill-mist-100 text-mist-300')} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function CopyCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Code ${code} copied`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Please copy the code manually.');
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={clsx('inline-flex items-center gap-2 rounded-lg border border-dashed border-gold-500 bg-gold-50 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-gold-800 transition hover:bg-gold-100', className)}
      aria-label={`Copy coupon code ${code}`}
    >
      {code}
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** Live mm:ss countdown to a timestamp. */
export function Countdown({ to, onExpire, className }: { to: string; onExpire?: () => void; className?: string }) {
  const [left, setLeft] = useState(() => new Date(to).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(to).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  if (left <= 0) return <span className={className}>expired</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={clsx('font-mono tabular-nums', className)}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'center', action, dark }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; align?: 'center' | 'left'; action?: ReactNode; dark?: boolean }) {
  return (
    <div className={clsx('mb-10 flex flex-wrap items-end gap-4', align === 'center' ? 'flex-col items-center text-center' : 'justify-between')}>
      <div className={clsx(align === 'center' && 'max-w-2xl')}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className={clsx('section-title mt-2', dark && '!text-white')}>{title}</h2>
        {subtitle && <p className={clsx('mt-3 text-base', dark ? 'text-navy-200' : 'text-slate-600')}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
