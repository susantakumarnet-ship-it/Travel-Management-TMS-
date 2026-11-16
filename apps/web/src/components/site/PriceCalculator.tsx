'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { combineIst, istToday, PURPOSE_LABEL } from '@/lib/format';
import type { PublicVehicle, TravelPurpose } from '@/lib/types';
import { Field, Input, Select } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Display';
import { PriceBreakdown } from './PriceBreakdown';
import { CouponInput } from './CouponInput';
import { useQuote, type QuoteInput } from './useQuote';
import { isoToIstParts, toQueryString } from './searchParams';
import { PICK_DATE_EVENT } from './AvailabilityCalendar';

export function PriceCalculator({ vehicle, initial }: { vehicle: PublicVehicle; initial: Record<string, string> }) {
  const pathname = usePathname();
  const p0 = isoToIstParts(initial.pickupAt);
  const r0 = isoToIstParts(initial.returnAt);
  const canSelf = vehicle.driverOption !== 'WITH_DRIVER';
  const canDriver = vehicle.driverOption !== 'SELF_DRIVE';
  const [f, setF] = useState({
    pickupDate: p0.date || istToday(1),
    pickupTime: p0.time || '09:00',
    returnDate: r0.date || istToday(1),
    returnTime: r0.time || '21:00',
    purpose: initial.purpose || (vehicle.category.isWedding ? 'WEDDING' : 'LOCAL_TRAVEL'),
    estimatedKm: initial.estimatedKm ?? '',
    pickupAddress: initial.pickupLocation ?? '',
    dropAddress: initial.dropLocation ?? '',
    withDriver: initial.withDriver ? initial.withDriver !== 'false' && canDriver : canDriver,
    decoration: initial.decoration === 'true' && vehicle.decorationAvailable,
  });
  const [coupon, setCoupon] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      setF((s) => ({ ...s, pickupDate: d, returnDate: s.returnDate < d ? d : s.returnDate }));
    };
    window.addEventListener(PICK_DATE_EVENT, onPick);
    return () => window.removeEventListener(PICK_DATE_EVENT, onPick);
  }, []);

  const { pickupAt, returnAt, invalid } = useMemo(() => {
    if (!f.pickupDate || !f.returnDate) return { pickupAt: '', returnAt: '', invalid: 'Choose your dates' };
    const a = combineIst(f.pickupDate, f.pickupTime);
    const b = combineIst(f.returnDate, f.returnTime);
    if (new Date(a).getTime() < Date.now()) return { pickupAt: a, returnAt: b, invalid: 'Pickup must be in the future' };
    if (new Date(b) <= new Date(a)) return { pickupAt: a, returnAt: b, invalid: 'Return must be after pickup' };
    return { pickupAt: a, returnAt: b, invalid: null };
  }, [f.pickupDate, f.pickupTime, f.returnDate, f.returnTime]);

  const base: QuoteInput | null = invalid
    ? null
    : {
        vehicleId: vehicle.id,
        purpose: f.purpose,
        pickupAt,
        returnAt,
        pickupAddress: f.pickupAddress.trim(),
        dropAddress: f.dropAddress.trim(),
        estimatedKm: f.estimatedKm ? Number(f.estimatedKm) : undefined,
        withDriver: f.withDriver,
        decoration: f.decoration,
      };
  const { data, error, loading } = useQuote(base ? { ...base, couponCode: coupon } : null);

  // If a previously valid coupon stops applying (e.g. dates changed), drop it.
  useEffect(() => {
    if (error && coupon) {
      toast.error(`Coupon ${coupon} removed: ${error}`);
      setCoupon('');
    }
  }, [error, coupon]);

  const bookQuery = toQueryString({
    pickupAt,
    returnAt,
    purpose: f.purpose,
    pickupLocation: f.pickupAddress.trim(),
    dropLocation: f.dropAddress.trim(),
    estimatedKm: f.estimatedKm || (data?.estimatedKm ? String(data.estimatedKm) : ''),
    withDriver: String(f.withDriver),
    decoration: f.decoration ? 'true' : '',
    passengers: initial.passengers,
    luggage: initial.luggage,
    travelPackageId: initial.travelPackageId,
    coupon,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <Field label="Pickup">
          <div className="flex gap-2">
            <Input type="date" aria-label="Pickup date" min={istToday()} value={f.pickupDate} onChange={(e) => { set('pickupDate', e.target.value); if (f.returnDate < e.target.value) set('returnDate', e.target.value); }} className="min-w-0" />
            <Input type="time" aria-label="Pickup time" value={f.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} className="w-[132px] shrink-0" />
          </div>
        </Field>
        <Field label="Return">
          <div className="flex gap-2">
            <Input type="date" aria-label="Return date" min={f.pickupDate} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} className="min-w-0" />
            <Input type="time" aria-label="Return time" value={f.returnTime} onChange={(e) => set('returnTime', e.target.value)} className="w-[132px] shrink-0" />
          </div>
        </Field>
        <Field label="Trip purpose">
          <Select value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
            {(Object.keys(PURPOSE_LABEL) as TravelPurpose[]).map((p) => (
              <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated km" hint="Total distance incl. return, if known">
          <Input type="number" min={0} max={20000} placeholder="e.g. 120" value={f.estimatedKm} onChange={(e) => set('estimatedKm', e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {canDriver && canSelf && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-mist-200 px-3 py-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={f.withDriver} onChange={(e) => set('withDriver', e.target.checked)} /> With driver
          </label>
        )}
        {vehicle.decorationAvailable && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-pink-200 bg-pink-50/50 px-3 py-2 text-sm font-medium text-pink-900">
            <input type="checkbox" className="h-4 w-4 accent-pink-600" checked={f.decoration} onChange={(e) => set('decoration', e.target.checked)} />
            <Sparkles className="h-4 w-4" /> Wedding decoration
          </label>
        )}
      </div>
      <CouponInput base={base} applied={coupon} onChange={setCoupon} loginHref={`/login?next=${encodeURIComponent(pathname)}`} />

      <div className="rounded-2xl border border-mist-200 bg-mist-50/60 p-4">
        {invalid ? (
          <p className="text-sm text-slate-500">{invalid}</p>
        ) : loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error && !coupon ? (
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        ) : data ? (
          <div className={loading ? 'opacity-60 transition' : 'transition'}>
            <p className={`mb-3 flex items-center gap-2 text-sm font-semibold ${data.available ? 'text-emerald-700' : 'text-red-600'}`}>
              {data.available ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {data.available ? 'Available for your dates' : 'Not available for these dates — try another slot'}
            </p>
            <PriceBreakdown quote={data.quote} />
            {data.distance && <p className="mt-2 text-xs text-slate-400">Distance estimated at {data.estimatedKm} km (round trip).</p>}
          </div>
        ) : null}
      </div>

      <Link
        href={`/book/${vehicle.id}${bookQuery}`}
        aria-disabled={!!invalid || data?.available === false}
        className={`flex h-12 items-center justify-center gap-2 rounded-xl text-base font-bold transition ${invalid || data?.available === false ? 'pointer-events-none bg-mist-200 text-slate-400' : 'bg-gold-sheen text-navy-950 shadow-gold hover:brightness-105'}`}
      >
        Book Now <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
