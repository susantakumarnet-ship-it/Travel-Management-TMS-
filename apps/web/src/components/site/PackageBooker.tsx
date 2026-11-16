'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { combineIst, istToday } from '@/lib/format';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { toQueryString } from './searchParams';
import type { TravelPackage } from './siteTypes';

/** "Book this package" → vehicle search pre-filtered with the recommended category and trip dates. */
export function PackageBooker({ pkg }: { pkg: TravelPackage }) {
  const router = useRouter();
  const [date, setDate] = useState(istToday(2));
  const [time, setTime] = useState('07:00');
  const [pax, setPax] = useState(String(Math.max(pkg.minPassengers, 2)));
  const [error, setError] = useState<string | null>(null);

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setError('Choose a start date');
    const pickupAt = combineIst(date, time);
    if (new Date(pickupAt).getTime() < Date.now()) return setError('Start must be in the future');
    const n = Number(pax);
    if (!n || n < 1) return setError('Enter number of passengers');
    if (n > pkg.maxPassengers) return setError(`This package suits up to ${pkg.maxPassengers} guests — use the custom enquiry for larger groups`);
    const endDay = new Date(new Date(`${date}T00:00:00+05:30`).getTime() + (Math.max(1, pkg.durationDays) - 1) * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
    const returnAt = combineIst(endDay, '21:00');
    router.push(
      '/vehicles' +
        toQueryString({
          category: pkg.recommendedCategory?.slug,
          purpose: pkg.type === 'OUTSTATION' ? 'OUTSTATION' : 'FAMILY_TRIP',
          pickupAt,
          returnAt,
          passengers: n,
          pickupLocation: pkg.startCity,
          dropLocation: pkg.destination,
          estimatedKm: pkg.estimatedKm || undefined,
          travelPackageId: pkg.id,
        }),
    );
  }

  return (
    <form onSubmit={go} className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Start date">
          <Input type="date" min={istToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[132px]" />
        </Field>
      </div>
      <Field label="Passengers" hint={`${pkg.minPassengers}–${pkg.maxPassengers} guests`}>
        <Input type="number" min={1} max={60} value={pax} onChange={(e) => setPax(e.target.value)} />
      </Field>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <Button type="submit" variant="gold" size="lg" className="w-full">
        Book this package <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="text-center text-xs text-slate-500">
        {pkg.durationDays} day{pkg.durationDays > 1 ? 's' : ''} from {pkg.startCity}. You&apos;ll pick a vehicle and see the exact price next.
      </p>
    </form>
  );
}
