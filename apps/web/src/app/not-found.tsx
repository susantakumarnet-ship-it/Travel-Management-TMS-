import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { CarArt } from '@/components/ui/CarArt';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-navy-deep text-white">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_20%_20%,rgba(201,162,39,.25),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(79,109,176,.3),transparent_45%)]" />
      <header className="container relative py-6">
        <Link href="/" className="inline-block h-10 text-lg" aria-label="Royal Ride home">
          <Logo dark />
        </Link>
      </header>
      <main className="container relative flex flex-1 flex-col items-center justify-center pb-20 text-center">
        <p className="font-display text-[7rem] font-semibold leading-none text-gold-400 md:text-[10rem]">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold !text-white md:text-4xl">Looks like we took a wrong turn</h1>
        <p className="mt-3 max-w-md text-navy-200">The page you&apos;re looking for has moved or doesn&apos;t exist. Let&apos;s get you back on the road.</p>
        <CarArt kind="sedan" className="mt-8 aspect-[16/7] w-full max-w-md rounded-3xl opacity-90" label="Car illustration" />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold-sheen px-6 font-bold text-navy-950 shadow-gold hover:brightness-105">
            <Home className="h-5 w-5" /> Back to home
          </Link>
          <Link href="/vehicles" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 px-6 font-semibold text-white hover:bg-white/10">
            <Compass className="h-5 w-5" /> Browse cars
          </Link>
        </div>
      </main>
    </div>
  );
}
