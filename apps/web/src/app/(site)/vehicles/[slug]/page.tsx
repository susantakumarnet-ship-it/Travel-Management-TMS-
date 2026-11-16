import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Briefcase, Building2, Car, Clock, Fuel, Gauge, Languages, Palette, ReceiptText, Settings2, ShieldCheck, Snowflake, Sparkles, Star, UserRound, Users } from 'lucide-react';
import { serverApi, SITE_URL } from '@/lib/server';
import type { PublicVehicle } from '@/lib/types';
import { fmtDate, FUEL_LABEL, inr, titleCase } from '@/lib/format';
import type { VehicleDetail } from '@/components/site/siteTypes';
import { flatParams, journeyQuery, type ParamRecord } from '@/components/site/searchParams';
import { VehicleGallery } from '@/components/site/VehicleGallery';
import { AvailabilityCalendar } from '@/components/site/AvailabilityCalendar';
import { PriceCalculator } from '@/components/site/PriceCalculator';
import { VehicleCard } from '@/components/site/VehicleCard';
import { Stars } from '@/components/site/bits';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ParamRecord> };

const DRIVER_LABEL: Record<PublicVehicle['driverOption'], string> = { WITH_DRIVER: 'With driver only', SELF_DRIVE: 'Self drive only', BOTH: 'With driver or self drive' };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const v = await serverApi<VehicleDetail>(`/public/vehicles/${encodeURIComponent(slug)}`, 120);
  if (!v) return { title: 'Vehicle not found' };
  const desc = `Rent ${v.title} (${v.seats} seater, ${v.hasAc ? 'AC' : 'non-AC'}) in ${v.city.name} from ${inr(v.pricing.perDayRate)}/day or ${inr(v.pricing.perKmRate)}/km. ${v.description ?? 'Verified operator, professional driver, transparent pricing.'}`.slice(0, 300);
  return {
    title: `${v.title} on rent in ${v.city.name}`,
    description: desc,
    alternates: { canonical: `/vehicles/${v.slug}` },
    openGraph: { title: `${v.title} | Royal Ride`, description: desc, images: v.images[0] ? [{ url: v.images[0].url }] : undefined },
  };
}

export default async function VehicleDetailsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = flatParams(await searchParams);
  const v = await serverApi<VehicleDetail>(`/public/vehicles/${encodeURIComponent(slug)}`, 60);
  if (!v) notFound();
  const p = v.pricing;
  const jq = journeyQuery(sp);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: v.title,
    description: v.description ?? `${v.make} ${v.model} ${v.year} available on rent in ${v.city.name}`,
    brand: { '@type': 'Brand', name: v.make },
    model: v.model,
    category: v.category.name,
    image: v.images.length ? v.images.map((i) => (i.url.startsWith('http') ? i.url : `${SITE_URL}${i.url}`)) : undefined,
    url: `${SITE_URL}/vehicles/${v.slug}`,
    ...(v.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.ratingCount } } : {}),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: p.perDayRate,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/vehicles/${v.slug}`,
      seller: { '@type': 'Organization', name: v.operator },
      priceSpecification: { '@type': 'UnitPriceSpecification', price: p.perDayRate, priceCurrency: 'INR', unitText: 'DAY' },
    },
  };

  const specs: [React.ReactNode, string, string][] = [
    [<Users key="i" className="h-5 w-5" />, 'Seats', `${v.seats} passengers`],
    [<Briefcase key="i" className="h-5 w-5" />, 'Luggage', `${v.luggageBags} bags`],
    [<Snowflake key="i" className="h-5 w-5" />, 'Air conditioning', v.hasAc ? 'AC' : 'Non-AC'],
    [<Fuel key="i" className="h-5 w-5" />, 'Fuel', FUEL_LABEL[v.fuelType] ?? titleCase(v.fuelType)],
    [<Settings2 key="i" className="h-5 w-5" />, 'Transmission', titleCase(v.transmission)],
    [<UserRound key="i" className="h-5 w-5" />, 'Driver', DRIVER_LABEL[v.driverOption]],
    [<Car key="i" className="h-5 w-5" />, 'Registration', v.registration],
    [<Palette key="i" className="h-5 w-5" />, 'Colour / year', `${v.color ?? '—'} · ${v.year}`],
    [<Building2 key="i" className="h-5 w-5" />, 'Operator', v.operator],
  ];

  const charges: [string, string][] = [
    ['Per day', inr(p.perDayRate)],
    ['Per hour', inr(p.perHourRate)],
    ['Per km (outstation)', inr(p.perKmRate)],
    ['Minimum booking', `${p.minBookingHours} hours`],
    ['Included km', `${p.includedKmPerDay} km/day · ${p.includedKmPerHour} km/hr`],
    ['Extra km', `${inr(p.extraKmRate)}/km`],
    ['Extra hour', `${inr(p.extraHourRate)}/hr`],
    ['Driver allowance', p.driverAllowancePerDay > 0 ? `${inr(p.driverAllowancePerDay)}/day` : 'Included'],
    ['Night charge', p.nightChargePerNight > 0 ? `${inr(p.nightChargePerNight)}/night` : 'None'],
    ...(v.decorationAvailable ? ([['Wedding decoration', p.decorationCharge > 0 ? inr(p.decorationCharge) : 'Included']] as [string, string][]) : []),
    ...(p.selfDrivePerDayRate ? ([['Self drive', `${inr(p.selfDrivePerDayRate)}/day`]] as [string, string][]) : []),
    ['Security deposit', p.securityDeposit > 0 ? `${inr(p.securityDeposit)} (self drive, refundable)` : 'Not required'],
  ];

  const tiers = [...(v.policies.cancellationTiers ?? [])].sort((a, b) => b.hoursBefore - a.hoursBefore);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="container py-6 md:py-10">
        <nav className="text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link> / <Link href={`/vehicles${jq}`} className="hover:underline">Cars</Link> /{' '}
          <Link href={`/vehicles?category=${v.category.slug}`} className="hover:underline">{v.category.name}</Link> / <span className="text-navy-900">{v.title}</span>
        </nav>

        <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-8">
            <div>
              <VehicleGallery images={v.images} title={v.title} categorySlug={v.category.slug} seats={v.seats} />
              <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-navy-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-navy-800">{v.category.name}</span>
                    {v.isFeatured && <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold-800">Featured</span>}
                    {v.decorationAvailable && <span className="flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700"><Sparkles className="h-3 w-3" /> Decoration available</span>}
                  </div>
                  <h1 className="mt-3 font-display text-3xl font-semibold md:text-4xl">{v.title}</h1>
                  <p className="mt-1 text-slate-600">{v.make} {v.model} · {v.year} · {v.city.name}</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-lg font-bold text-navy-900">
                    <Star className="h-5 w-5 fill-gold-400 text-gold-400" /> {v.ratingCount ? v.rating.toFixed(1) : 'New'}
                  </p>
                  <p className="text-xs text-slate-500">{v.ratingCount} review{v.ratingCount === 1 ? '' : 's'}</p>
                </div>
              </div>
              {v.description && <p className="mt-4 leading-7 text-slate-700">{v.description}</p>}
              {v.features.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {v.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 rounded-full border border-mist-200 px-3 py-1 text-xs font-medium text-slate-700">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <section className="card p-5 md:p-6" aria-labelledby="specs">
              <h2 id="specs" className="text-lg font-semibold">Specifications</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {specs.map(([icon, k, val]) => (
                  <div key={k} className="flex items-start gap-3">
                    <span className="rounded-xl bg-gold-50 p-2 text-gold-700">{icon}</span>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
                      <dd className="text-sm font-medium text-navy-900">{val}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </section>

            {v.driver && (
              <section className="card flex flex-wrap items-center gap-4 p-5 md:p-6" aria-labelledby="driver">
                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-xl font-semibold text-gold-300">
                  {v.driver.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.driver.avatarUrl} alt={v.driver.name ?? 'Driver'} className="h-full w-full object-cover" />
                  ) : (
                    (v.driver.name ?? 'D').charAt(0)
                  )}
                </span>
                <div className="flex-1">
                  <h2 id="driver" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your chauffeur</h2>
                  <p className="font-semibold text-navy-900">{v.driver.name ?? 'Verified driver'}</p>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="flex items-center gap-1"><Gauge className="h-4 w-4 text-gold-600" /> {v.driver.experienceYears} yrs experience</span>
                    {v.driver.languages.length > 0 && <span className="flex items-center gap-1"><Languages className="h-4 w-4 text-gold-600" /> {v.driver.languages.join(', ')}</span>}
                    {v.driver.ratingCount > 0 && <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-gold-400 text-gold-400" /> {v.driver.rating.toFixed(1)}</span>}
                  </p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Background verified</span>
              </section>
            )}

            <section className="card p-5 md:p-6" aria-labelledby="charges">
              <h2 id="charges" className="flex items-center gap-2 text-lg font-semibold"><ReceiptText className="h-5 w-5 text-gold-600" /> Charges & rental conditions</h2>
              <dl className="mt-4 divide-y divide-mist-100 text-sm">
                {charges.map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-slate-600">{k}</dt>
                    <dd className="text-right font-semibold text-navy-900">{val}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Policy title="Fuel policy" text={v.policies.fuel} />
                <Policy title="Tolls & parking" text={v.policies.tollParking} />
                {v.policies.nightCharge && <Policy title="Night charges" text={v.policies.nightCharge} />}
                {v.policies.securityDeposit && <Policy title="Security deposit" text={v.policies.securityDeposit} />}
                <Policy title="Advance & GST" text={`Pay ${v.policies.advancePercent}% advance to confirm. GST @ ${v.policies.gstPercent}% is included in the quote.`} />
              </div>
            </section>

            {tiers.length > 0 && (
              <section className="card p-5 md:p-6" aria-labelledby="cancel">
                <h2 id="cancel" className="text-lg font-semibold">Cancellation policy</h2>
                <div className="mt-4 overflow-hidden rounded-xl border border-mist-200">
                  <table className="w-full text-sm">
                    <thead className="bg-navy-900 text-left text-white">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Cancelled before pickup</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Refund of amount paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t, i) => (
                        <tr key={t.hoursBefore} className="border-t border-mist-200">
                          <td className="px-4 py-2.5">{i === 0 ? `${t.hoursBefore} hours or more` : `${t.hoursBefore} – ${tiers[i - 1].hoursBefore} hours`}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-navy-900">{t.refundPercent}%</td>
                        </tr>
                      ))}
                      <tr className="border-t border-mist-200">
                        <td className="px-4 py-2.5">Less than {tiers[tiers.length - 1].hoursBefore} hours / no-show</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-navy-900">0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <Link href="/cancellation-policy" className="mt-3 inline-block text-sm font-semibold text-navy-600 hover:underline">Read the full policy</Link>
              </section>
            )}

            <section className="card p-5 md:p-6" aria-labelledby="avail">
              <h2 id="avail" className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-gold-600" /> Availability — next 30 days</h2>
              <div className="mt-4 max-w-md">
                <AvailabilityCalendar vehicleId={v.id} />
              </div>
            </section>

            <section aria-labelledby="reviews">
              <h2 id="reviews" className="text-lg font-semibold">Customer reviews</h2>
              {v.reviews.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-mist-50 p-5 text-sm text-slate-500">No reviews yet — be the first to ride and review this vehicle.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {v.reviews.map((r) => (
                    <article key={r.id} className="card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-navy-900">{r.customer.name ?? 'Royal Ride customer'}</p>
                        <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <Stars value={r.rating} />
                        {r.vehicleRating && <span>Vehicle {r.vehicleRating}/5</span>}
                        {r.driverRating && <span>Driver {r.driverRating}/5</span>}
                      </div>
                      {r.comment && <p className="mt-2 text-sm leading-6 text-slate-700">{r.comment}</p>}
                      {r.ownerReply && (
                        <p className="mt-3 rounded-xl bg-mist-50 p-3 text-sm text-slate-600">
                          <span className="font-semibold text-navy-900">Reply from {v.operator}:</span> {r.ownerReply}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start" id="price-calculator">
            <div className="card scroll-mt-24 p-5 md:p-6">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Price calculator</h2>
                <p className="text-sm text-slate-500">
                  from <span className="font-bold text-navy-900">{inr(p.perDayRate)}</span>/day
                </p>
              </div>
              <PriceCalculator vehicle={v} initial={sp} />
            </div>
          </aside>
        </div>

        {v.similar.length > 0 && (
          <section className="mt-16" aria-labelledby="similar">
            <h2 id="similar" className="section-title">Similar vehicles</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {v.similar.map((s) => (
                <VehicleCard key={s.id} v={s} query={jq} compact />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function Policy({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-mist-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-slate-700">{text}</p>
    </div>
  );
}
