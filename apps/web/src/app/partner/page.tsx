import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeIndianRupee, CalendarCheck, CarFront, CheckCircle2, ClipboardCheck, Crown, FileCheck2, Headphones, Percent, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { PublicHeader } from '@/components/partner/common';

export const metadata: Metadata = {
  title: 'Become a Vehicle Partner',
  description: 'List your wedding cars, luxury vehicles, SUVs and Tempo Travellers on Royal Ride. Verified bookings, transparent commission, weekly settlements across Odisha.',
};

const benefits = [
  { icon: CalendarCheck, title: 'Verified, prepaid bookings', text: 'Customers pay an advance online before a booking reaches you — no fake enquiries, no haggling.' },
  { icon: Crown, title: 'Premium wedding demand', text: 'Weddings, receptions and baraat convoys across Bhubaneswar, Cuttack, Puri and beyond.' },
  { icon: Wallet, title: 'Regular settlements', text: 'Earnings are settled straight to your bank account with a clear statement for every trip.' },
  { icon: Smartphone, title: 'Run your fleet from your phone', text: 'Accept bookings, assign drivers, block dates and track payouts from one dashboard.' },
  { icon: ShieldCheck, title: 'You stay in control', text: 'Set your own rates, accept or decline every booking and block dates for personal use or maintenance.' },
  { icon: Headphones, title: 'Dedicated partner support', text: 'A real team in Odisha to help with onboarding, disputes and customer coordination.' },
];

const steps = [
  { icon: Smartphone, title: 'Sign up with your mobile', text: 'Verify your number with an OTP — takes 30 seconds.' },
  { icon: ClipboardCheck, title: 'Add business & bank details', text: 'PAN, optional GSTIN and the account where you want payouts.' },
  { icon: FileCheck2, title: 'Upload KYC & vehicle papers', text: 'PAN, Aadhaar, bank proof, then RC, insurance, permit and photos for each vehicle.' },
  { icon: CarFront, title: 'Go live & receive bookings', text: 'Once our team verifies your documents, your vehicles appear to customers.' },
];

export default function PartnerLanding() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader
        right={
          <>
            <Link href="/partner/login" className="rounded-lg px-3 py-2 font-semibold text-white hover:bg-white/10">
              Sign in
            </Link>
            <ButtonLink href="/partner/login" variant="gold" size="sm" className="hidden sm:inline-flex">
              Register
            </ButtonLink>
          </>
        }
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-deep text-white">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_15%_20%,#c9a22744,transparent_40%),radial-gradient(circle_at_85%_80%,#4f6db055,transparent_45%)]" />
        <div className="container relative grid grid-cols-1 gap-10 py-16 md:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow text-gold-300">Royal Ride Partner Program</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white text-balance md:text-5xl lg:text-6xl">
              Turn your fleet into a <span className="text-gold-400">premium business</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100">
              List your wedding cars, luxury sedans, SUVs and Tempo Travellers on Odisha&apos;s most trusted car-rental marketplace. Prepaid bookings, transparent commission, timely payouts.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/partner/login" variant="gold" size="lg">
                Register as partner
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="white" size="lg">
                How it works
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-100">
              {['No listing fee', 'Set your own rates', 'Accept only the trips you want'].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gold-400" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: '0', v: 'Listing fee', icon: BadgeIndianRupee },
              { k: '100%', v: 'Prepaid advance before trip', icon: ShieldCheck },
              { k: '24×7', v: 'Partner support', icon: Headphones },
              { k: 'Your', v: 'Rates, your schedule', icon: Users },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <s.icon className="h-6 w-6 text-gold-400" />
                <p className="mt-3 font-display text-3xl font-semibold text-white">{s.k}</p>
                <p className="mt-1 text-sm text-navy-100">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why partner with us</p>
          <h2 className="section-title mt-3">Everything you need to grow</h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="inline-flex rounded-xl bg-gold-50 p-3 text-gold-700">
                <b.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 bg-mist-50 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="section-title mt-3">Live in four simple steps</h2>
          </div>
          <ol className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl bg-white p-6 shadow-card">
                <span className="absolute right-5 top-5 font-display text-4xl font-semibold text-mist-200">{i + 1}</span>
                <div className="inline-flex rounded-xl bg-navy-900 p-3 text-gold-400">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Commission transparency */}
      <section className="container py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Commission transparency</p>
            <h2 className="section-title mt-3">Know exactly what you earn — before you accept</h2>
            <p className="mt-4 text-slate-600">
              Royal Ride charges a simple platform commission on the taxable trip fare only. Tolls, parking and state taxes collected on the trip are passed through to you in full. Every booking shows the commission rate, the amount deducted and your payout.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Standard commission is 15% of the taxable fare (category or partner-specific rates may apply).',
                'GST is collected from the customer and handled by the platform.',
                'Extra km and extra hours added at trip end are included in your payout.',
                'Rejected or cancelled bookings never cost you anything.',
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <Percent className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="card overflow-hidden">
            <div className="bg-navy-900 px-6 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Example · Wedding day booking</p>
              <p className="mt-1 font-semibold">Mercedes E-Class · 10 hrs · Bhubaneswar</p>
            </div>
            <dl className="divide-y divide-mist-100 px-6 py-2 text-sm">
              {[
                ['Trip fare (taxable)', '₹12,000'],
                ['Platform commission (15%)', '− ₹1,800'],
                ['Tolls & parking (pass-through)', '+ ₹350'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-3">
                  <dt className="text-slate-600">{k}</dt>
                  <dd className={v.startsWith('−') ? 'font-semibold text-red-600' : 'font-semibold text-navy-900'}>{v}</dd>
                </div>
              ))}
              <div className="flex justify-between py-4 text-base">
                <dt className="font-bold text-navy-900">Your payout</dt>
                <dd className="font-bold text-emerald-700">₹10,550</dd>
              </div>
            </dl>
            <p className="bg-mist-50 px-6 py-3 text-xs text-slate-500">Illustrative only. GST is charged to the customer separately and is not deducted from your payout.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-deep py-16 text-white">
        <div className="container flex flex-col items-center gap-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-white md:text-4xl">Ready to drive more bookings?</h2>
          <p className="max-w-xl text-navy-100">Join the partners already earning with Royal Ride. Registration is free and takes less than 10 minutes.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/partner/login" variant="gold" size="lg">
              Register as partner
            </ButtonLink>
            <ButtonLink href="/driver/login" variant="white" size="lg">
              I&apos;m a driver
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-mist-200 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Royal Ride ·{' '}
        <Link href="/" className="underline">
          Back to website
        </Link>
      </footer>
    </div>
  );
}
