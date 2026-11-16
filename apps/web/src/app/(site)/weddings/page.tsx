import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Car, Clock, Crown, Flower2, Gauge, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { serverApi } from '@/lib/server';
import type { Category, Paged, PublicVehicle } from '@/lib/types';
import { inr } from '@/lib/format';
import { CarArt } from '@/components/ui/CarArt';
import type { WeddingPackage } from '@/components/site/siteTypes';
import { VehicleCard } from '@/components/site/VehicleCard';
import { SectionHeading } from '@/components/site/bits';
import { WeddingRequestForm } from '@/components/site/WeddingRequestForm';
import { firstParam, type ParamRecord } from '@/components/site/searchParams';

export const metadata: Metadata = {
  title: 'Wedding Car Rental in Bhubaneswar & Odisha – Decorated Bride & Groom Cars',
  description: 'Silver, Gold, Premium and Luxury wedding car packages with floral decoration, bride & groom cars, guest vehicles, multiple pickup points and a dedicated coordinator.',
  alternates: { canonical: '/weddings' },
};

const TIER_STYLE: Record<WeddingPackage['tier'], string> = {
  SILVER: 'from-slate-100 to-white ring-slate-200',
  GOLD: 'from-gold-50 to-white ring-gold-200',
  PREMIUM: 'from-navy-50 to-white ring-navy-200',
  LUXURY: 'from-navy-900 to-navy-950 ring-gold-400 text-white',
};

export default async function WeddingsPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const sp = await searchParams;
  const [packages, categories, decorated] = await Promise.all([
    serverApi<WeddingPackage[]>('/public/wedding-packages', 300),
    serverApi<Category[]>('/public/categories', 300),
    serverApi<Paged<PublicVehicle>>('/public/vehicles?decoration=true&pageSize=6&sort=rating', 120),
  ]);
  const pk = packages ?? [];
  const selected = firstParam(sp.package);

  return (
    <>
      <section className="relative overflow-hidden bg-navy-deep">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_20%_20%,rgba(244,114,182,.18),transparent_40%),radial-gradient(circle_at_85%_60%,rgba(201,162,39,.3),transparent_45%)]" />
        <div className="container relative grid grid-cols-1 items-center gap-10 py-16 md:py-24 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-gold-300">
              <Flower2 className="h-4 w-4" /> Royal Weddings
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight !text-white md:text-6xl text-balance">Arrive like royalty on your big day</h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100">
              Floral-decorated bride & groom cars, coordinated guest fleets, baraat convoys and pre-wedding event transport — planned end-to-end by our wedding desk.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#request" className="inline-flex h-13 items-center gap-2 rounded-xl bg-gold-sheen px-7 py-3.5 font-bold text-navy-950 shadow-gold hover:brightness-105">
                <Sparkles className="h-5 w-5" /> Request a wedding quote
              </a>
              <a href="#packages" className="inline-flex items-center rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white hover:bg-white/10">
                View packages
              </a>
            </div>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-4 text-center text-sm text-navy-200">
              <div><HeartHandshake className="mx-auto h-6 w-6 text-gold-400" /><p className="mt-1">Dedicated coordinator</p></div>
              <div><Flower2 className="mx-auto h-6 w-6 text-gold-400" /><p className="mt-1">Fresh floral décor</p></div>
              <div><Clock className="mx-auto h-6 w-6 text-gold-400" /><p className="mt-1">On-time guarantee</p></div>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-lg" aria-hidden>
            <div className="overflow-hidden rounded-[2rem] shadow-2xl ring-2 ring-gold-400/40">
              <CarArt kind="wedding" className="aspect-[4/3]" />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden w-1/2 -rotate-6 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/20 sm:block">
              <CarArt kind="luxury" className="aspect-[4/3]" />
            </div>
          </div>
        </div>
      </section>

      <section className="container scroll-mt-20 py-16 md:py-24" id="packages">
        <SectionHeading eyebrow="Packages" title="Wedding car packages" subtitle="Every package is fully customisable — add vehicles, events and décor in your request." />
        {pk.length === 0 ? (
          <p className="text-center text-sm text-slate-500">Packages are being updated. Send us a request below and we&apos;ll build a custom quote.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {pk.map((w) => {
              const dark = w.tier === 'LUXURY';
              return (
                <article key={w.id} className={`relative flex flex-col rounded-3xl bg-gradient-to-b p-6 ring-1 transition hover:-translate-y-1 hover:shadow-lift ${TIER_STYLE[w.tier]}`}>
                  {w.tier === 'PREMIUM' && <span className="absolute -top-3 left-6 rounded-full bg-gold-sheen px-3 py-1 text-xs font-bold text-navy-950 shadow-gold">Most popular</span>}
                  <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] ${dark ? 'text-gold-300' : 'text-gold-700'}`}>
                    <Crown className="h-4 w-4" /> {w.tier}
                  </p>
                  <h3 className={`mt-2 font-display text-2xl font-semibold ${dark ? '!text-white' : ''}`}>{w.name}</h3>
                  {w.tagline && <p className={`mt-1 text-sm ${dark ? 'text-navy-200' : 'text-slate-600'}`}>{w.tagline}</p>}
                  <p className="mt-5 text-3xl font-bold">{inr(w.basePrice)}</p>
                  <p className={`text-xs ${dark ? 'text-navy-300' : 'text-slate-500'}`}>starting price · + GST</p>
                  <ul className={`mt-4 grid grid-cols-3 gap-2 rounded-2xl p-3 text-center text-xs ${dark ? 'bg-white/5' : 'bg-white/80'}`}>
                    <li><Car className="mx-auto h-4 w-4 text-gold-600" />{w.vehicleCount} car{w.vehicleCount > 1 ? 's' : ''}</li>
                    <li><Clock className="mx-auto h-4 w-4 text-gold-600" />{w.includedHours} hrs</li>
                    <li><Gauge className="mx-auto h-4 w-4 text-gold-600" />{w.includedKm} km</li>
                  </ul>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {w.inclusions.map((x) => (
                      <li key={x} className="flex gap-2">
                        <BadgeCheck className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? 'text-gold-400' : 'text-emerald-600'}`} /> {x}
                      </li>
                    ))}
                  </ul>
                  {w.vehicleHighlights.length > 0 && (
                    <p className={`mt-4 text-xs ${dark ? 'text-navy-200' : 'text-slate-500'}`}>
                      <span className="font-semibold">Cars: </span>
                      {w.vehicleHighlights.join(', ')}
                    </p>
                  )}
                  <p className={`mt-2 text-xs ${dark ? 'text-navy-300' : 'text-slate-400'}`}>
                    Extra hour {inr(w.extraHourRate)} · extra km {inr(w.extraKmRate)}
                  </p>
                  <Link
                    href={`/weddings?package=${w.id}#request`}
                    scroll={false}
                    className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold transition ${dark ? 'bg-gold-sheen text-navy-950 hover:brightness-105' : 'bg-navy-900 text-white hover:bg-navy-800'}`}
                  >
                    Select {w.name}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {decorated?.items && decorated.items.length > 0 && (
        <section className="bg-mist-50 py-16 md:py-24">
          <div className="container">
            <SectionHeading
              align="left"
              eyebrow="Decorated cars"
              title="Cars ready for your wedding"
              action={
                <Link href="/vehicles?decoration=true&purpose=WEDDING" className="text-sm font-semibold text-navy-700 hover:underline">
                  View all decorated cars →
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {decorated.items.map((v) => (
                <VehicleCard key={v.id} v={v} query="?purpose=WEDDING&decoration=true" />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="container scroll-mt-20 py-16 md:py-24" id="request">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow">Wedding request</p>
            <h2 className="section-title mt-2">Tell us about your wedding</h2>
            <p className="mt-3 text-slate-600">Share the details and our wedding desk will send a tailored, itemised quote — usually within a few hours. No payment is needed to request a quote.</p>
            <ol className="mt-8 space-y-5">
              {[
                ['Share your plan', 'Date, venue, cars, pickup points and events.'],
                ['Get an itemised quote', 'Vehicles, décor, hours and GST — clearly listed in your account.'],
                ['Accept & relax', 'We allocate cars, chauffeurs and a coordinator for the day.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 font-bold text-gold-300">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-navy-900">{t}</p>
                    <p className="text-sm text-slate-600">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-center gap-2 text-sm text-slate-500"><Users className="h-4 w-4 text-gold-600" /> Large guest fleets of 20+ vehicles welcome.</p>
          </div>
          <WeddingRequestForm packages={pk} categories={categories ?? []} initialPackage={selected} />
        </div>
      </section>
    </>
  );
}
