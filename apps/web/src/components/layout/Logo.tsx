import clsx from 'clsx';

/** Royal Ride wordmark: a crown over a steering-wheel ring. Original artwork. */
export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 40 40" className="h-full w-auto" aria-hidden>
        <defs>
          <linearGradient id="rr-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ecd88d" />
            <stop offset=".5" stopColor="#c9a227" />
            <stop offset="1" stopColor="#86661a" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="22" r="14" fill="none" stroke="url(#rr-gold)" strokeWidth="3" />
        <circle cx="20" cy="22" r="3.5" fill="url(#rr-gold)" />
        <path d="M20 22 L20 35 M20 22 L8.5 28 M20 22 L31.5 28" stroke="url(#rr-gold)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M11 9 L14.5 13 L20 5.5 L25.5 13 L29 9 L28 15 L12 15 Z" fill="url(#rr-gold)" />
      </svg>
      <span className={clsx('font-display text-[1.15em] font-bold leading-none tracking-tight', dark ? 'text-white' : 'text-navy-900')}>
        Royal<span className="text-gold-500">Ride</span>
      </span>
    </span>
  );
}
