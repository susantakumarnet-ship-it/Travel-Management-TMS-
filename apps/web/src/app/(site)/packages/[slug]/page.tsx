import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Car, Check, MapPin, Route, Sparkles, Users, X } from 'lucide-react';
import { serverApi, SITE_URL } from '@/lib/server';
import { inr } from '@/lib/format';
import { PACKAGE_TYPE_LABEL, type TravelPackage } from '@/components/site/siteTypes';
import { packageBg } from '@/components/site/PackageCard';
import { PackageBooker } from '@/components/site/PackageBooker';
import { EnquiryForm } from '@/components/site/EnquiryForm';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await serverApi<TravelPackage>(`/public/travel-packages/${encodeURIComponent(slug)}`, 300);
  if (!p) return { title: 'Package not found' };
  const desc = (p.summary ?? `${p.durationDays}-day ${p.destination} trip from ${p.startCity} with a chauffeur-driven vehicle.`).slice(0, 300);
  return { title: `${p.title} – ${p.durationDays}D tour package`, description: desc, alternates: { canonical: `/packages/${p.slug}` }, openGraph: { title: p.title, description: desc } };
}

export default async function PackageDetailsPage({ params }: Props) {
  const { slug } = await params;
  const p = await serverApi<TravelPackage>(`/public/travel-packages/${encodeURIComponent(slug)}`, 120);
  if (!p) notFound();
  const itinerary = p.itinerary ?? [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: p.title,
    description: p.summary ?? p.description ?? undefined,
    touristType: PACKAGE_TYPE_LABEL[p.type],
    itinerary: itinerary.length ? { '@type': 'ItemList', itemListElement: itinerary.map((d) => ({ '@type': 'ListItem', position: d.dayNumber, name: d.title })) } : undefined,
    offers: { '@type': 'Offer', price: p.basePrice, priceCurrency: 'INR', url: `${SITE_URL}/packages/${p.slug}` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="relative overflow-hidden" style={{ background: packageBg(p.slug) }}>
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover opacity-50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/50 to-transparent" />
        <div className="container relative py-14 md:py-24">
          <nav className="text-xs text-navy-200" aria-label="Breadcrumb">
            <Link href="/" className="hover:underline">Home</Link> / <Link href="/packages" className="hover:underline">Tour packages</Link> / <span className="text-white">{p.title}</span>
          </nav>
          <span className="mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold-200 backdrop-blur">{PACKAGE_TYPE_LABEL[p.type]}</span>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold !text-white md:text-5xl text-balance">{p.title}</h1>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-100">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold-400" /> {p.destination}</span>
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-gold-400" /> {p.durationDays} days{p.durationNights ? ` / ${p.durationNights} nights` : ''}</span>
            {p.estimatedKm > 0 && <span className="flex items-center gap-1.5"><Route className="h-4 w-4 text-gold-400" /> ~{p.estimatedKm} km</span>}
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-gold-400" /> {p.minPassengers}–{p.maxPassengers} guests</span>
          </div>
        </div>
      </section>

      <div className="container grid grid-cols-1 gap-10 py-10 md:py-14 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          {(p.summary || p.description) && (
            <section>
              {p.summary && <p className="text-lg leading-8 text-slate-700">{p.summary}</p>}
              {p.description && <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{p.description}</p>}
            </section>
          )}

          {p.highlights.length > 0 && (
            <section aria-labelledby="hl">
              <h2 id="hl" className="section-title !text-2xl">Highlights</h2>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3 rounded-2xl bg-gold-50 p-4 text-sm font-medium text-navy-900 ring-1 ring-inset ring-gold-100">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" /> {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {itinerary.length > 0 && (
            <section aria-labelledby="itin">
              <h2 id="itin" className="section-title !text-2xl">Day-wise itinerary</h2>
              <ol className="relative mt-6 space-y-6 border-l-2 border-gold-200 pl-8">
                {itinerary.map((d) => (
                  <li key={d.id} className="relative">
                    <span className="absolute -left-[45px] flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-gold-300 ring-4 ring-white">D{d.dayNumber}</span>
                    <div className="card p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Day {d.dayNumber}</p>
                      <h3 className="mt-1 font-semibold text-navy-900">{d.title}</h3>
                      {d.description && <p className="mt-2 text-sm leading-6 text-slate-600">{d.description}</p>}
                      {d.places.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {d.places.map((pl) => (
                            <li key={pl} className="flex items-center gap-1 rounded-full bg-mist-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              <MapPin className="h-3 w-3 text-gold-600" /> {pl}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="card p-5">
              <h2 className="font-semibold text-navy-900">Inclusions</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {p.inclusions.length ? p.inclusions.map((x) => (
                  <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {x}</li>
                )) : <li className="text-slate-500">Vehicle with driver, fuel and driver allowance.</li>}
              </ul>
            </div>
            <div className="card p-5">
              <h2 className="font-semibold text-navy-900">Exclusions</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {p.exclusions.length ? p.exclusions.map((x) => (
                  <li key={x} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> {x}</li>
                )) : <li className="text-slate-500">Hotels, meals, entry tickets, tolls & parking.</li>}
              </ul>
            </div>
          </section>

          <section className="card p-6 md:p-8" id="enquire" aria-labelledby="enq">
            <h2 id="enq" className="font-display text-2xl font-semibold">Want it customised?</h2>
            <p className="mt-1 text-sm text-slate-600">Add days, hotels or extra stops — we&apos;ll tailor this trip and send a quote.</p>
            <div className="mt-5">
              <EnquiryForm
                type="CUSTOM_TRAVEL"
                defaultMessage={`I'm interested in a customised version of "${p.title}".`}
                meta={{ packageSlug: p.slug, packageTitle: p.title }}
                submitLabel="Request customised quote"
              />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Package price from</p>
            <p className="mt-1 text-3xl font-bold text-navy-900">{inr(p.basePrice)}</p>
            {p.recommendedCategory && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <Car className="h-4 w-4 text-gold-600" /> Recommended: <Link href={`/vehicles?category=${p.recommendedCategory.slug}`} className="font-semibold text-navy-800 hover:underline">{p.recommendedCategory.name}</Link>
              </p>
            )}
            <div className="mt-5 border-t border-mist-200 pt-5">
              <PackageBooker pkg={p} />
            </div>
            <a href="#enquire" className="mt-3 block text-center text-sm font-semibold text-navy-600 hover:underline">or request a customised package</a>
          </div>
        </aside>
      </div>
    </>
  );
}
