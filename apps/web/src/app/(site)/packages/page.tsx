import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { Compass, Search } from 'lucide-react';
import { serverApi } from '@/lib/server';
import type { Category } from '@/lib/types';
import { PACKAGE_TYPE_LABEL, type TravelPackage, type TravelPackageType } from '@/components/site/siteTypes';
import { PackageCard } from '@/components/site/PackageCard';
import { EnquiryForm } from '@/components/site/EnquiryForm';
import { flatParams, toQueryString, type ParamRecord } from '@/components/site/searchParams';

export const metadata: Metadata = {
  title: 'Odisha Tour Packages – Puri, Konark, Chilika, Daringbadi & more',
  description: 'Chauffeur-driven Odisha tour packages: temple circuits, beach getaways, hill weekends, wildlife safaris and outstation trips with transparent all-inclusive pricing.',
  alternates: { canonical: '/packages' },
};

const TYPES: TravelPackageType[] = ['ODISHA_TOUR', 'CITY_SIGHTSEEING', 'FAMILY_VACATION', 'WEEKEND_TRIP', 'OUTSTATION'];

export default async function PackagesPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const sp = flatParams(await searchParams);
  const type = TYPES.includes(sp.type as TravelPackageType) ? sp.type : undefined;
  const q = sp.q?.slice(0, 80);
  const [packages, categories] = await Promise.all([
    serverApi<TravelPackage[]>(`/public/travel-packages${toQueryString({ type, q })}`, 120),
    serverApi<Category[]>('/public/categories', 300),
  ]);

  return (
    <>
      <section className="relative overflow-hidden bg-navy-deep">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_80%_20%,rgba(201,162,39,.25),transparent_45%)]" />
        <div className="container relative py-14 md:py-20">
          <p className="eyebrow !text-gold-400">Tour packages</p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold !text-white md:text-5xl text-balance">Discover Odisha with a chauffeur who knows the way</h1>
          <p className="mt-4 max-w-xl text-navy-100">Curated itineraries with comfortable vehicles, experienced drivers and transparent pricing.</p>
          <form action="/packages" method="get" className="mt-8 flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-lift" role="search">
            {type && <input type="hidden" name="type" value={type} />}
            <label htmlFor="pkg-q" className="sr-only">Search packages</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="pkg-q" name="q" defaultValue={q} placeholder="Search Puri, Chilika, Simlipal…" className="h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none" maxLength={80} />
            </div>
            <button className="rounded-xl bg-gold-sheen px-5 text-sm font-bold text-navy-950">Search</button>
          </form>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin" aria-label="Package types">
          <TypeLink href={`/packages${toQueryString({ q })}`} active={!type}>All packages</TypeLink>
          {TYPES.map((t) => (
            <TypeLink key={t} href={`/packages${toQueryString({ type: t, q })}`} active={type === t}>
              {PACKAGE_TYPE_LABEL[t]}
            </TypeLink>
          ))}
        </nav>
        {q && (
          <p className="mt-4 text-sm text-slate-600">
            Results for “<span className="font-semibold text-navy-900">{q}</span>” · <Link href={`/packages${toQueryString({ type })}`} className="font-semibold text-navy-600 underline">clear</Link>
          </p>
        )}
        <div className="mt-8">
          {!packages ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Couldn&apos;t load packages right now. Please try again shortly.</div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-mist-300 bg-mist-50 px-6 py-14 text-center">
              <Compass className="h-10 w-10 text-navy-300" />
              <p className="mt-3 font-semibold text-navy-900">No packages match your search</p>
              <p className="mt-1 text-sm text-slate-500">Tell us where you&apos;d like to go below and we&apos;ll build a custom trip.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <PackageCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-mist-50 py-16 md:py-20" id="customise">
        <div className="container grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">Tailor-made</p>
            <h2 className="section-title mt-2">Customise your trip</h2>
            <p className="mt-3 text-slate-600">Pick your destinations, duration and vehicle — our travel desk will design an itinerary and send you a quote. Perfect for pilgrimages, family reunions and corporate offsites.</p>
          </div>
          <div className="card p-6 md:p-8">
            <EnquiryForm travel categories={categories ?? []} submitLabel="Request custom itinerary" />
          </div>
        </div>
      </section>
    </>
  );
}

function TypeLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={clsx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition', active ? 'bg-navy-900 text-white' : 'bg-mist-100 text-slate-700 hover:bg-mist-200')}>
      {children}
    </Link>
  );
}
