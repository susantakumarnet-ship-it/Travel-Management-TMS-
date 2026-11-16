import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { CalendarCheck, Heart, ShieldCheck, Tag } from 'lucide-react';
import { CarArt } from '@/components/ui/CarArt';
import { Spinner } from '@/components/ui/Spinner';
import { CustomerLogin } from '@/components/site/CustomerLogin';

export const metadata: Metadata = { title: 'Sign in or create an account', robots: { index: false, follow: true } };

export default function LoginPage() {
  return (
    <section className="bg-mist-50">
      <div className="container grid grid-cols-1 min-h-[calc(100vh-72px)] items-center gap-10 py-10 lg:grid-cols-2">
        <div className="hidden lg:block">
          <div className="relative overflow-hidden rounded-[2rem] bg-navy-deep p-10 text-white shadow-lift">
            <p className="eyebrow !text-gold-400">Welcome to Royal Ride</p>
            <h1 className="mt-3 font-display text-4xl font-semibold !text-white">Your journey, our responsibility</h1>
            <ul className="mt-8 space-y-4 text-navy-100">
              <li className="flex items-center gap-3"><CalendarCheck className="h-5 w-5 text-gold-400" /> Track bookings live, from confirmation to drop</li>
              <li className="flex items-center gap-3"><Heart className="h-5 w-5 text-gold-400" /> Manage wedding requests & quotes</li>
              <li className="flex items-center gap-3"><Tag className="h-5 w-5 text-gold-400" /> Apply exclusive member coupons</li>
              <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-gold-400" /> Password-free, secure OTP sign in</li>
            </ul>
            <CarArt kind="luxury" className="mt-10 aspect-[16/8] rounded-2xl" />
          </div>
        </div>
        <div className="card mx-auto w-full max-w-md p-6 md:p-8">
          <h2 className="font-display text-2xl font-semibold">Sign in / Sign up</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Enter your mobile number to continue. New here? We&apos;ll create your account instantly.</p>
          <Suspense fallback={<div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-navy-700" /></div>}>
            <CustomerLogin />
          </Suspense>
          <p className="mt-6 border-t border-mist-200 pt-4 text-center text-xs text-slate-500">
            Vehicle owner? <Link href="/partner/login" className="font-semibold text-navy-700 underline">Partner sign in</Link> · Driver? <Link href="/driver/login" className="font-semibold text-navy-700 underline">Driver sign in</Link>
          </p>
          <p className="mt-2 text-center text-xs text-slate-400">
            By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
