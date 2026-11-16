import Link from 'next/link';
import { Briefcase, CheckCircle2, Clock, Fuel, Settings2, Snowflake, Sparkles, Star, UserRound, Users } from 'lucide-react';
import type { PublicVehicle } from '@/lib/types';
import { FUEL_LABEL, inr, titleCase } from '@/lib/format';
import { VehicleImage } from '@/components/ui/CarArt';

const DRIVER_LABEL: Record<PublicVehicle['driverOption'], string> = {
  WITH_DRIVER: 'With driver',
  SELF_DRIVE: 'Self drive',
  BOTH: 'Driver / self drive',
};

/** Search-result & listing card. `query` is the journey query string (starting with "?" or empty). */
export function VehicleCard({ v, query = '', compact }: { v: PublicVehicle; query?: string; compact?: boolean }) {
  const detailsHref = `/vehicles/${v.slug}${query}`;
  const bookHref = `/book/${v.id}${query}`;
  const searched = v.available !== null && v.available !== undefined;
  return (
    <article className="group card flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <Link href={detailsHref} className="relative block aspect-[16/10] overflow-hidden" aria-label={`View ${v.title}`}>
        <VehicleImage src={v.images[0]?.url} alt={v.images[0]?.alt ?? v.title} categorySlug={v.category.slug} seats={v.seats} className="h-full w-full transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-navy-900 shadow-sm">{v.category.name}</span>
          {v.isFeatured && <span className="rounded-full bg-gold-sheen px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-navy-950 shadow-sm">Featured</span>}
        </div>
        {v.decorationAvailable && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-pink-50/95 px-2.5 py-1 text-[11px] font-bold text-pink-700 shadow-sm">
            <Sparkles className="h-3 w-3" /> Décor
          </span>
        )}
        {searched && (
          <span className={`absolute bottom-3 left-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${v.available ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            <CheckCircle2 className="h-3 w-3" /> {v.available ? 'Available for your dates' : 'Unavailable'}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-navy-900">
              <Link href={detailsHref} className="hover:text-navy-600">{v.title}</Link>
            </h3>
            <p className="truncate text-xs text-slate-500">
              {v.make} {v.model} · {v.year} · {v.city.name}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-mist-100 px-2 py-1 text-xs font-bold text-navy-900">
            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" />
            {v.ratingCount > 0 ? v.rating.toFixed(1) : 'New'}
            {v.ratingCount > 0 && <span className="font-normal text-slate-500">({v.ratingCount})</span>}
          </span>
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600">
          <Spec icon={<Users className="h-3.5 w-3.5" />}>{v.seats} seats</Spec>
          <Spec icon={<Briefcase className="h-3.5 w-3.5" />}>{v.luggageBags} bags</Spec>
          <Spec icon={<Snowflake className="h-3.5 w-3.5" />}>{v.hasAc ? 'AC' : 'Non-AC'}</Spec>
          <Spec icon={<Fuel className="h-3.5 w-3.5" />}>{FUEL_LABEL[v.fuelType] ?? titleCase(v.fuelType)}</Spec>
          <Spec icon={<Settings2 className="h-3.5 w-3.5" />}>{titleCase(v.transmission)}</Spec>
          <Spec icon={<UserRound className="h-3.5 w-3.5" />}>{DRIVER_LABEL[v.driverOption]}</Spec>
          {!compact && <Spec icon={<Clock className="h-3.5 w-3.5" />}>Min {v.pricing.minBookingHours} hrs</Spec>}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-mist-50 p-3 text-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per day</p>
            <p className="text-sm font-bold text-navy-900">{inr(v.pricing.perDayRate)}</p>
          </div>
          <div className="border-l border-mist-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per km</p>
            <p className="text-sm font-bold text-navy-900">{inr(v.pricing.perKmRate)}</p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            {v.estimate && v.estimate.total > 0 ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Est. total for your dates</p>
                <p className="text-lg font-bold text-navy-900">{inr(v.estimate.total)}</p>
                <p className="text-[11px] text-slate-500">Advance {inr(v.estimate.advance)} · incl. GST</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Starting from</p>
                <p className="text-lg font-bold text-navy-900">
                  {inr(v.pricing.perHourRate)}
                  <span className="text-xs font-medium text-slate-500">/hr</span>
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Link href={bookHref} className="inline-flex h-10 items-center rounded-xl bg-gold-sheen px-4 text-sm font-bold text-navy-950 shadow-gold transition hover:brightness-105">
              Book Now
            </Link>
            <Link href={detailsHref} className="text-xs font-semibold text-navy-600 hover:underline">
              View details
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function Spec({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="text-gold-600">{icon}</span>
      {children}
    </li>
  );
}

export function VehicleCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[16/10] animate-pulse bg-mist-200" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-mist-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-mist-200" />
        <div className="h-16 animate-pulse rounded-xl bg-mist-100" />
        <div className="h-10 animate-pulse rounded-xl bg-mist-100" />
      </div>
    </div>
  );
}
