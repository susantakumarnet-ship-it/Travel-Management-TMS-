import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarClock, Crown, Headphones, HeartHandshake, MapPin, Quote as QuoteIcon, ShieldCheck, Sparkles, Star, Tag, Wallet } from 'lucide-react';
import { serverApi } from '@/lib/server';
import type { Category, Paged, PublicVehicle, SiteConfig } from '@/lib/types';
import { fmtDate, inr } from '@/lib/format';
import { CarArt, kindFor } from '@/components/ui/CarArt';
import { ButtonLink } from '@/components/ui/Button';
import { SearchWidget } from '@/components/site/SearchWidget';
import { VehicleCard } from '@/components/site/VehicleCard';
import { CopyCode, SectionHeading, Stars } from '@/components/site/bits';
import { EnquiryForm } from '@/components/site/EnquiryForm';
import { FALLBACK_CONFIG } from '@/components/site/fallbackConfig';
import type { Destination, Offer, Testimonial, WeddingPackage } from '@/components/site/siteTypes';

export const revalidate = 120;

const WHY_FALLBACK = [
  { title: 'Verified partners & chauffeurs', text: 'Every operator, vehicle document and driver licence is checked before going live.' },
  { title: 'Transparent pricing', text: 'Line-item fares with GST shown upfront. Tolls and parking at actuals — no surprises.' },
  { title: 'Wedding specialists', text: 'Decorated bride & groom cars, guest fleets and a coordinator for your big day.' },
  { title: 'Pay just an advance', text: 'Confirm with a small advance and pay the balance closer to your trip.' },
  { title: 'Live trip tracking', text: 'Follow every step from confirmation to driver assignment and trip completion.' },
  { title: '24×7 support', text: 'Call or WhatsApp our Bhubaneswar travel desk any time during your journey.' },
];
const WHY_ICONS = [BadgeCheck, Wallet, HeartHandshake, ShieldCheck, CalendarClock, Headphones];

export default async function HomePage() {
  const [config, categories, featured, weddings, destinations, offers, testimonials] = await Promise.all([
    serverApi<SiteConfig>('/public/config', 300),
    serverApi<Category[]>('/public/categories', 300),
    serverApi<Paged<PublicVehicle>>('/public/vehicles?featured=true&pageSize=6', 120),
    serverApi<WeddingPackage[]>('/public/wedding-packages', 300),
    serverApi<Destination[]>('/public/destinations', 300),
    serverApi<Offer[]>('/public/offers', 120),
    serverApi<Testimonial[]>('/public/testimonials', 300),
  ]);
  const cfg = config ?? FALLBACK_CONFIG;
  const hero = (cfg.content['home.hero'] ?? {}) as { heading?: string; subheading?: string; badge?: string };
  const stats = ((cfg.content['home.stats'] as { items?: { label: string; value: string }[] } | undefined)?.items ?? []).slice(0, 4);
  const whyBlock = (cfg.content['home.why'] as { items?: { title: string; text?: string; description?: string }[] } | undefined)?.items;
  const why = whyBlock?.length ? whyBlock.map((w) => ({ title: w.title, text: w.text ?? w.description ?? '' })) : WHY_FALLBACK;
  const cats = categories ?? [];

  return (
    <>
      {/* ─────────── Hero ─────────── */}
      <section className="relative overflow-hidden bg-navy-deep pb-40 pt-14 md:pb-48 md:pt-20">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_15%_10%,rgba(201,162,39,.25),transparent_40%),radial-gradient(circle_at_90%_70%,rgba(79,109,176,.35),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="container relative grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gold-200 backdrop-blur">
              <Crown className="h-3.5 w-3.5 text-gold-400" /> {hero.badge ?? "Odisha's trusted wedding & travel fleet"}
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] !text-white sm:text-5xl lg:text-6xl text-balance">
              {hero.heading ?? 'Your Journey, Our Responsibility'}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100">{hero.subheading ?? 'Book Your Perfect Ride for Weddings, Holidays and Every Special Occasion'}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/vehicles" variant="gold" size="lg" icon={<Sparkles className="h-5 w-5" />}>
                Explore cars
              </ButtonLink>
              <ButtonLink href="/weddings" variant="white" size="lg">
                Wedding packages
              </ButtonLink>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-navy-200">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-gold-400" /> Verified drivers</span>
              <span className="flex items-center gap-1.5"><Wallet className="h-4 w-4 text-gold-400" /> Pay {cfg.booking.advancePercent}% advance</span>
              <span className="flex items-center gap-1.5"><Headphones className="h-4 w-4 text-gold-400" /> 24×7 support</span>
            </div>
          </div>
          <div className="relative mx-auto hidden h-[380px] w-full max-w-[520px] sm:block" aria-hidden>
            <div className="absolute right-0 top-0 w-[72%] rotate-3 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10 transition duration-700 hover:rotate-1">
              <CarArt kind="luxury" className="aspect-[4/3]" />
            </div>
            <div className="absolute bottom-6 left-0 w-[68%] -rotate-3 overflow-hidden rounded-3xl shadow-2xl ring-2 ring-gold-400/40 transition duration-700 hover:-rotate-1">
              <CarArt kind="wedding" className="aspect-[4/3]" />
            </div>
            <div className="absolute -bottom-2 right-6 w-[40%] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <CarArt kind="suv" className="aspect-[4/3]" />
            </div>
            <div className="absolute left-8 top-10 rounded-2xl bg-white/95 px-4 py-3 shadow-lift">
              <p className="flex items-center gap-1 text-sm font-bold text-navy-900"><Star className="h-4 w-4 fill-gold-400 text-gold-400" /> 4.8 / 5</p>
              <p className="text-xs text-slate-500">from verified trips</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Search widget ─────────── */}
      <section className="container relative z-10 -mt-32 md:-mt-36" id="search">
        <SearchWidget categories={cats} />
      </section>

      {/* ─────────── Stats ─────────── */}
      {stats.length > 0 && (
        <section className="container mt-12">
          <dl className="grid grid-cols-2 gap-4 rounded-3xl border border-mist-200 bg-mist-50 p-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col text-center">
                <dt className="order-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</dt>
                <dd className="font-display text-3xl font-semibold text-navy-900 md:text-4xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ─────────── Categories ─────────── */}
      <section className="container py-16 md:py-24">
        <SectionHeading eyebrow="Our fleet" title="Popular vehicle categories" subtitle="From budget hatchbacks to decorated wedding limousines and 26-seat coaches." />
        {cats.length === 0 ? (
          <p className="text-center text-sm text-slate-500">Categories are loading. Please refresh in a moment.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => (
              <Link key={c.id} href={`/vehicles?category=${c.slug}`} className="group card flex items-center gap-4 overflow-hidden p-3 transition hover:-translate-y-1 hover:shadow-lift">
                <CarArt kind={kindFor(c.slug)} className="h-24 w-32 shrink-0 rounded-xl" label={c.name} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-navy-900">{c.name}</h3>
                  <p className="line-clamp-2 text-xs text-slate-500">{c.description}</p>
                  <p className="mt-2 text-sm">
                    {c.fromPerDay ? (
                      <>
                        <span className="text-slate-500">from </span>
                        <span className="font-bold text-navy-900">{inr(c.fromPerDay)}</span>
                        <span className="text-slate-500">/day</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Coming soon</span>
                    )}
                    {c.vehicleCount ? <span className="ml-2 text-xs text-slate-400">· {c.vehicleCount} vehicles</span> : null}
                  </p>
                </div>
                <ArrowRight className="mr-2 h-5 w-5 shrink-0 text-gold-600 transition group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─────────── Wedding packages teaser ─────────── */}
      <section className="relative overflow-hidden bg-navy-deep py-16 md:py-24">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_80%_0%,rgba(201,162,39,.22),transparent_45%)]" />
        <div className="container relative">
          <SectionHeading dark eyebrow="Weddings" title="Royal wedding car packages" subtitle="Decorated cars for the bride & groom, guest fleets and a dedicated coordinator — all in one booking." />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(weddings ?? []).slice(0, 4).map((w, i) => (
              <div key={w.id} className={`flex flex-col rounded-3xl p-6 ring-1 transition hover:-translate-y-1 ${i === 2 ? 'bg-gold-sheen text-navy-950 ring-gold-300 shadow-gold' : 'bg-white/5 text-white ring-white/10 backdrop-blur'}`}>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] ${i === 2 ? 'text-navy-900' : 'text-gold-400'}`}>{w.tier}</p>
                <h3 className={`mt-2 font-display text-2xl font-semibold ${i === 2 ? '!text-navy-950' : '!text-white'}`}>{w.name}</h3>
                <p className={`mt-1 text-sm ${i === 2 ? 'text-navy-900/80' : 'text-navy-200'}`}>{w.tagline}</p>
                <p className="mt-4 text-3xl font-bold">{inr(w.basePrice)}</p>
                <p className={`text-xs ${i === 2 ? 'text-navy-900/70' : 'text-navy-300'}`}>
                  {w.vehicleCount} vehicle{w.vehicleCount > 1 ? 's' : ''} · {w.includedHours} hrs · {w.includedKm} km
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {w.inclusions.slice(0, 4).map((x) => (
                    <li key={x} className="flex gap-2">
                      <BadgeCheck className={`mt-0.5 h-4 w-4 shrink-0 ${i === 2 ? 'text-navy-900' : 'text-gold-400'}`} /> {x}
                    </li>
                  ))}
                </ul>
                <Link href={`/weddings?package=${w.id}#request`} className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold transition ${i === 2 ? 'bg-navy-950 text-white hover:bg-navy-900' : 'bg-white text-navy-900 hover:bg-mist-100'}`}>
                  Choose {w.name}
                </Link>
              </div>
            ))}
          </div>
          {(weddings ?? []).length === 0 && <p className="text-center text-navy-200">Wedding packages will appear here shortly.</p>}
          <div className="mt-10 text-center">
            <ButtonLink href="/weddings" variant="gold" size="lg">
              Plan your wedding transport <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ─────────── Recommended vehicles ─────────── */}
      <section className="container py-16 md:py-24">
        <SectionHeading align="left" eyebrow="Handpicked" title="Recommended vehicles" action={<ButtonLink href="/vehicles" variant="outline">View all cars <ArrowRight className="h-4 w-4" /></ButtonLink>} />
        {featured?.items?.length ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((v) => (
              <VehicleCard key={v.id} v={v} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No featured vehicles right now. <Link className="font-semibold text-navy-700 underline" href="/vehicles">Browse all cars</Link>.</p>
        )}
      </section>

      {/* ─────────── Destinations ─────────── */}
      {destinations && destinations.length > 0 && (
        <section className="bg-mist-50 py-16 md:py-24">
          <div className="container">
            <SectionHeading eyebrow="Explore Odisha" title="Popular destinations" subtitle="Temple towns, golden beaches, hill stations and wildlife — with a chauffeur who knows the way." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {destinations.slice(0, 8).map((d, i) => (
                <Link
                  key={d.id}
                  href={`/packages?q=${encodeURIComponent(d.name)}`}
                  className="group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-3xl p-5 text-white shadow-card transition hover:-translate-y-1 hover:shadow-lift"
                  style={{ background: DEST_BG[i % DEST_BG.length] }}
                >
                  {d.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.imageUrl} alt={d.name} className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:scale-105" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/20 to-transparent" />
                  <div className="relative">
                    <p className="flex items-center gap-1 text-xs font-semibold text-gold-300"><MapPin className="h-3.5 w-3.5" /> {d.distanceKm ? `${d.distanceKm} km from Bhubaneswar` : d.state}</p>
                    <h3 className="mt-1 font-display text-2xl font-semibold !text-white">{d.name}</h3>
                    {d.tagline && <p className="text-sm text-navy-100">{d.tagline}</p>}
                    {d.startingFare && <p className="mt-2 text-sm font-semibold">from {inr(d.startingFare)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────── Offers ─────────── */}
      <section className="container scroll-mt-24 py-16 md:py-24" id="offers">
        <SectionHeading eyebrow="Save more" title="Special offers" subtitle="Apply these codes at checkout. Terms apply." />
        {offers && offers.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <div key={o.id} className="relative overflow-hidden rounded-3xl border border-gold-200 bg-gradient-to-br from-gold-50 to-white p-6 shadow-card">
                <Tag className="absolute -right-4 -top-4 h-24 w-24 rotate-12 text-gold-100" aria-hidden />
                <p className="relative text-3xl font-bold text-navy-900">
                  {o.discountType === 'PERCENT' ? `${o.value}% OFF` : `${inr(o.value)} OFF`}
                </p>
                <h3 className="relative mt-1 font-semibold text-navy-900">{o.title}</h3>
                {o.description && <p className="relative mt-1 text-sm text-slate-600">{o.description}</p>}
                <p className="relative mt-2 text-xs text-slate-500">
                  {o.minOrderAmount > 0 && `Min. booking ${inr(o.minOrderAmount)} · `}
                  {o.maxDiscount ? `Up to ${inr(o.maxDiscount)} · ` : ''}Valid till {fmtDate(o.validTo)}
                </p>
                <div className="relative mt-4">
                  <CopyCode code={o.code} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">No active offers right now — check back soon.</p>
        )}
      </section>

      {/* ─────────── Testimonials ─────────── */}
      {testimonials && testimonials.length > 0 && (
        <section className="bg-mist-50 py-16 md:py-24">
          <div className="container">
            <SectionHeading eyebrow="Testimonials" title="Loved by families across Odisha" />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.slice(0, 6).map((t) => (
                <figure key={t.id} className="card flex flex-col p-6">
                  <QuoteIcon className="h-8 w-8 text-gold-300" aria-hidden />
                  <Stars value={t.rating} className="mt-3" />
                  <blockquote className="mt-3 flex-1 text-sm leading-6 text-slate-700">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3 border-t border-mist-100 pt-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 font-semibold text-gold-300">{t.name.charAt(0)}</span>
                    <span>
                      <span className="block text-sm font-semibold text-navy-900">{t.name}</span>
                      <span className="block text-xs text-slate-500">{[t.occasion, t.location].filter(Boolean).join(' · ')}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────── Why choose us ─────────── */}
      <section className="container py-16 md:py-24">
        <SectionHeading eyebrow="Why Royal Ride" title="Premium service, honest pricing" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {why.slice(0, 6).map((w, i) => {
            const Icon = WHY_ICONS[i % WHY_ICONS.length];
            return (
              <div key={w.title} className="rounded-3xl border border-mist-200 p-6 transition hover:border-gold-300 hover:shadow-card">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-semibold text-navy-900">{w.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{w.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────── Contact ─────────── */}
      <section className="bg-mist-50 py-16 md:py-24" id="contact">
        <div className="container grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="eyebrow">Talk to us</p>
            <h2 className="section-title mt-2">Need help planning?</h2>
            <p className="mt-3 text-slate-600">Share your plan and our travel desk will call you back with the best vehicle options and a transparent quote.</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li><a className="font-semibold text-navy-800 hover:underline" href={`tel:${cfg.contact.phone}`}>{cfg.contact.phone}</a></li>
              <li><a className="font-semibold text-navy-800 hover:underline" href={`mailto:${cfg.contact.email}`}>{cfg.contact.email}</a></li>
              <li className="text-slate-600">{cfg.contact.address}</li>
            </ul>
          </div>
          <div className="card p-6 md:p-8">
            <EnquiryForm categories={cats} />
          </div>
        </div>
      </section>

      {/* ─────────── CTA ─────────── */}
      <section className="container py-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-navy-deep px-6 py-12 text-center md:px-12 md:py-16">
          <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_0%,rgba(201,162,39,.3),transparent_55%)]" />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold !text-white md:text-4xl">Ready for your next journey?</h2>
            <p className="mx-auto mt-3 max-w-xl text-navy-200">Check live availability and get an instant, all-inclusive price in seconds.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/vehicles" variant="gold" size="lg">Book a car</ButtonLink>
              <ButtonLink href="/partner" variant="white" size="lg">List your vehicle</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const DEST_BG = [
  'linear-gradient(150deg,#183065,#06122d)',
  'linear-gradient(150deg,#86661a,#0b1f4b)',
  'linear-gradient(150deg,#2f4f96,#06122d)',
  'linear-gradient(150deg,#0b1f4b,#a9841d)',
];
