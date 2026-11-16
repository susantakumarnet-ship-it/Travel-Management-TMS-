import Link from 'next/link';
import { CalendarDays, MapPin, Route, Users } from 'lucide-react';
import { inr } from '@/lib/format';
import { PACKAGE_TYPE_LABEL, type TravelPackage } from './siteTypes';

const BG = ['linear-gradient(140deg,#112656,#06122d 70%)', 'linear-gradient(140deg,#86661a,#0b1f4b 75%)', 'linear-gradient(140deg,#2f4f96,#0b1f4b 70%)', 'linear-gradient(140deg,#183065,#a9841d 120%)'];

export function packageBg(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BG[h % BG.length];
}

export function PackageCard({ p }: { p: TravelPackage }) {
  return (
    <article className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
      <Link href={`/packages/${p.slug}`} className="relative flex h-48 flex-col justify-end overflow-hidden p-5 text-white" style={{ background: packageBg(p.slug) }}>
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-navy-900">{PACKAGE_TYPE_LABEL[p.type]}</span>
        {p.isFeatured && <span className="absolute right-4 top-4 rounded-full bg-gold-sheen px-2.5 py-1 text-[11px] font-bold uppercase text-navy-950">Bestseller</span>}
        <p className="relative flex items-center gap-1 text-xs font-semibold text-gold-300">
          <MapPin className="h-3.5 w-3.5" /> {p.destination}
        </p>
        <h3 className="relative mt-1 font-display text-xl font-semibold leading-snug !text-white">{p.title}</h3>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {p.summary && <p className="line-clamp-2 text-sm text-slate-600">{p.summary}</p>}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <li className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-gold-600" /> {p.durationDays}D{p.durationNights ? ` / ${p.durationNights}N` : ''}</li>
          {p.estimatedKm > 0 && <li className="flex items-center gap-1"><Route className="h-3.5 w-3.5 text-gold-600" /> ~{p.estimatedKm} km</li>}
          <li className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-gold-600" /> {p.minPassengers}–{p.maxPassengers} guests</li>
        </ul>
        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Starting at</p>
            <p className="text-xl font-bold text-navy-900">{inr(p.basePrice)}</p>
            {p.recommendedCategory && <p className="text-[11px] text-slate-500">with {p.recommendedCategory.name}</p>}
          </div>
          <Link href={`/packages/${p.slug}`} className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800">
            View trip
          </Link>
        </div>
      </div>
    </article>
  );
}
