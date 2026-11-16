import clsx from 'clsx';

/**
 * Elegant SVG vehicle illustration used whenever a vehicle has no uploaded photo
 * (partners/admins upload real photography from their portals).
 */
type Kind = 'hatchback' | 'sedan' | 'suv' | 'luxury' | 'wedding' | 'bus';

export function kindFor(categorySlug?: string, seats?: number): Kind {
  const s = categorySlug ?? '';
  if (s.includes('wedding')) return 'wedding';
  if (s.includes('luxury')) return 'luxury';
  if (s.includes('traveller') || s.includes('group') || (seats ?? 0) > 8) return 'bus';
  if (s.includes('suv') || s.includes('muv') || (seats ?? 0) >= 6) return 'suv';
  if (s.includes('economy')) return 'hatchback';
  return 'sedan';
}

const bodies: Record<Kind, string> = {
  hatchback: 'M40 118 L58 88 Q66 76 82 74 L150 70 Q170 70 186 84 L214 106 L244 112 Q258 115 258 128 L258 140 L40 140 Z',
  sedan: 'M28 120 L56 96 Q66 86 84 84 L128 70 Q146 64 168 66 L200 72 Q214 76 226 90 L256 108 Q272 112 272 126 L272 140 L28 140 Z',
  luxury: 'M22 122 L52 100 Q64 90 82 88 L130 70 Q148 63 172 64 L206 70 Q222 74 234 90 L262 108 Q278 113 278 128 L278 140 L22 140 Z',
  wedding: 'M22 122 L52 100 Q64 90 82 88 L130 70 Q148 63 172 64 L206 70 Q222 74 234 90 L262 108 Q278 113 278 128 L278 140 L22 140 Z',
  suv: 'M30 124 L36 86 Q40 70 58 68 L196 64 Q214 64 226 78 L254 104 Q270 108 270 124 L270 140 L30 140 Z',
  bus: 'M20 136 L20 62 Q20 50 34 50 L252 50 Q272 50 276 70 L282 112 Q284 124 284 132 L284 140 L20 140 Z',
};

export function CarArt({ kind = 'sedan', className, label }: { kind?: Kind; className?: string; label?: string }) {
  const accent = kind === 'wedding' || kind === 'luxury' ? '#c9a227' : '#7d95c9';
  return (
    <div className={clsx('relative flex items-center justify-center overflow-hidden bg-navy-deep', className)} role="img" aria-label={label ?? 'Vehicle illustration'}>
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,#c9a22755,transparent_45%),radial-gradient(circle_at_80%_90%,#4f6db055,transparent_50%)]" />
      <svg viewBox="0 0 300 170" className="relative w-[78%] max-w-[340px] drop-shadow-[0_18px_22px_rgba(0,0,0,.45)]">
        <ellipse cx="150" cy="150" rx="128" ry="8" fill="#000" opacity=".35" />
        <path d={bodies[kind]} fill="url(#body)" stroke={accent} strokeWidth="1.5" />
        {kind === 'bus' ? (
          <g fill="#0b1f4b" opacity=".85">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={34 + i * 38} y="62" width="30" height="30" rx="4" />
            ))}
          </g>
        ) : (
          <path d={kind === 'suv' ? 'M64 76 L196 72 Q208 72 216 82 L232 102 L56 102 Z' : 'M90 92 L134 76 Q148 71 168 72 L200 77 Q212 80 220 92 L230 104 L78 104 Z'} fill="#0b1f4b" opacity=".85" />
        )}
        <line x1="40" y1="118" x2="262" y2="118" stroke={accent} strokeWidth="1" opacity=".6" />
        {[kind === 'bus' ? 70 : 78, kind === 'bus' ? 234 : 220].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="140" r="18" fill="#111827" />
            <circle cx={cx} cy="140" r="9" fill="#9ca3af" />
            <circle cx={cx} cy="140" r="3" fill="#374151" />
          </g>
        ))}
        {kind === 'wedding' && (
          <g>
            <path d="M118 66 q32 -26 64 0" fill="none" stroke="#f9a8d4" strokeWidth="3" />
            {[118, 134, 150, 166, 182].map((x, i) => (
              <circle key={x} cx={x} cy={i % 2 ? 56 : 62} r="4.5" fill={i % 2 ? '#fde68a' : '#fbcfe8'} />
            ))}
            <path d="M140 118 q10 -14 20 0 q-10 10 -20 0z" fill="#f472b6" />
          </g>
        )}
        <defs>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={kind === 'wedding' ? '#ffffff' : '#e5e7eb'} />
            <stop offset="1" stopColor={kind === 'wedding' ? '#e7e5e4' : '#94a3b8'} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/** Shows the first uploaded photo, or the illustration fallback. */
export function VehicleImage({ src, alt, categorySlug, seats, className }: { src?: string | null; alt: string; categorySlug?: string; seats?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={clsx('object-cover', className)} />;
  }
  return <CarArt kind={kindFor(categorySlug, seats)} className={className} label={alt} />;
}
