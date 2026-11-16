'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, CreditCard, Lock, MapPin, Plus, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { combineIst, fmtDateTime, inr, istToday, PURPOSE_LABEL } from '@/lib/format';
import type { Checkout, TravelPurpose } from '@/lib/types';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Display';
import { VehicleImage } from '@/components/ui/CarArt';
import { OtpLogin } from '@/components/ui/OtpLogin';
import { PriceBreakdown } from './PriceBreakdown';
import { CouponInput } from './CouponInput';
import { useQuote, type QuoteInput } from './useQuote';
import { usePayment } from './TestCheckout';
import { useSiteConfig } from './SiteConfig';
import { isoToIstParts, journeyQuery } from './searchParams';
import type { Address, VehicleDetail } from './siteTypes';

const STEPS = ['Journey', 'Review', 'Sign in', 'Payment'] as const;

export function CheckoutFlow({ vehicleId }: { vehicleId: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const config = useSiteConfig();
  const { pay, modal } = usePayment();
  const { data: vehicle, error: vErr, loading: vLoading, reload } = useApi<VehicleDetail>(`/public/vehicles/${vehicleId}`);
  const isCustomer = user?.role === 'CUSTOMER';
  const { data: addresses } = useApi<Address[]>(isCustomer ? '/customer/addresses' : null);

  const p0 = isoToIstParts(sp.get('pickupAt'));
  const r0 = isoToIstParts(sp.get('returnAt'));
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    pickupDate: p0.date || istToday(1),
    pickupTime: p0.time || '09:00',
    returnDate: r0.date || istToday(1),
    returnTime: r0.time || '21:00',
    purpose: sp.get('purpose') || 'LOCAL_TRAVEL',
    pickupAddress: sp.get('pickupLocation') ?? '',
    dropAddress: sp.get('dropLocation') ?? '',
    stops: [] as string[],
    passengers: sp.get('passengers') ?? '1',
    luggage: sp.get('luggage') ?? '0',
    estimatedKm: sp.get('estimatedKm') ?? '',
    withDriver: sp.get('withDriver') !== 'false',
    acRequired: sp.get('ac') !== 'false',
    decoration: sp.get('decoration') === 'true',
    destinationState: '',
    specialRequests: '',
    passengerList: [] as { name: string; phone: string }[],
  });
  const [coupon, setCoupon] = useState('');
  const [couponTried, setCouponTried] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payMode, setPayMode] = useState<'ADVANCE' | 'FULL'>('ADVANCE');
  const [paying, setPaying] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // Normalise options against the vehicle once loaded.
  useEffect(() => {
    if (!vehicle) return;
    setF((s) => ({
      ...s,
      withDriver: vehicle.driverOption === 'SELF_DRIVE' ? false : vehicle.driverOption === 'WITH_DRIVER' ? true : s.withDriver,
      acRequired: vehicle.hasAc ? s.acRequired : false,
      decoration: vehicle.decorationAvailable ? s.decoration || (s.purpose === 'WEDDING' && vehicle.category.isWedding) : false,
      purpose: sp.get('purpose') || (vehicle.category.isWedding ? 'WEDDING' : s.purpose),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle]);

  const times = useMemo(() => {
    const a = f.pickupDate && f.pickupTime ? combineIst(f.pickupDate, f.pickupTime) : '';
    const b = f.returnDate && f.returnTime ? combineIst(f.returnDate, f.returnTime) : '';
    return { pickupAt: a, returnAt: b };
  }, [f.pickupDate, f.pickupTime, f.returnDate, f.returnTime]);

  const datesValid = !!times.pickupAt && !!times.returnAt && new Date(times.returnAt) > new Date(times.pickupAt) && new Date(times.pickupAt).getTime() > Date.now();

  const base: QuoteInput | null =
    vehicle && datesValid
      ? {
          vehicleId: vehicle.id,
          purpose: f.purpose,
          pickupAt: times.pickupAt,
          returnAt: times.returnAt,
          pickupAddress: f.pickupAddress.trim(),
          dropAddress: f.dropAddress.trim(),
          estimatedKm: f.estimatedKm ? Number(f.estimatedKm) : undefined,
          withDriver: f.withDriver,
          decoration: f.decoration,
        }
      : null;
  const { data: q, error: qErr, loading: qLoading } = useQuote(base ? { ...base, couponCode: coupon } : null);

  // Pre-apply a coupon carried from the details page once the user is signed in.
  useEffect(() => {
    const c = sp.get('coupon');
    if (c && isCustomer && !couponTried) {
      setCouponTried(true);
      setCoupon(c.toUpperCase());
    }
  }, [sp, isCustomer, couponTried]);
  useEffect(() => {
    if (qErr && coupon) {
      toast.error(`Coupon ${coupon} could not be applied: ${qErr}`);
      setCoupon('');
    }
  }, [qErr, coupon]);

  function validateJourney(): boolean {
    const e: Record<string, string> = {};
    if (!times.pickupAt) e.pickupAt = 'Choose pickup date & time';
    else if (new Date(times.pickupAt).getTime() < Date.now() + config.booking.minLeadHours * 3_600_000) e.pickupAt = `Pickup must be at least ${config.booking.minLeadHours} hours from now`;
    if (!times.returnAt) e.returnAt = 'Choose return date & time';
    else if (times.pickupAt && new Date(times.returnAt) <= new Date(times.pickupAt)) e.returnAt = 'Return must be after pickup';
    if (f.pickupAddress.trim().length < 3) e.pickupAddress = 'Enter the pickup address';
    const pax = Number(f.passengers);
    if (!pax || pax < 1) e.passengers = 'At least 1 passenger';
    else if (vehicle && pax > vehicle.seats) e.passengers = `This vehicle seats up to ${vehicle.seats}`;
    if (vehicle && Number(f.luggage) > Math.max(vehicle.luggageBags, 0) + 2) e.luggageBags = `Recommended max ${vehicle.luggageBags} bags`;
    f.passengerList.forEach((p, i) => {
      if (!p.name.trim()) e[`passenger_${i}`] = 'Enter a name or remove this row';
    });
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields');
      return false;
    }
    return true;
  }

  function next() {
    if (step === 0 && !validateJourney()) return;
    if (step === 1) {
      if (!q) return toast.error(qErr ?? 'Waiting for the price quote…');
      if (!q.available) return toast.error('This vehicle is not available for the selected time');
    }
    let n = step + 1;
    if (n === 2 && isCustomer) n = 3;
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function back() {
    let n = step - 1;
    if (n === 2 && isCustomer) n = 1;
    setStep(Math.max(0, n));
  }

  // Signed-in while on step 2 → move on.
  useEffect(() => {
    if (step === 2 && isCustomer) setStep(3);
  }, [step, isCustomer]);

  async function placeAndPay() {
    if (!vehicle || !q) return;
    setPaying(true);
    setUnavailable(null);
    try {
      let id = bookingId;
      if (!id) {
        const booking = await api<{ id: string }>('/customer/bookings', {
          body: {
            vehicleId: vehicle.id,
            purpose: f.purpose,
            withDriver: f.withDriver,
            pickupAt: times.pickupAt,
            returnAt: times.returnAt,
            pickupAddress: f.pickupAddress.trim(),
            dropAddress: f.dropAddress.trim() || undefined,
            stops: f.stops.map((s) => s.trim()).filter(Boolean),
            estimatedKm: f.estimatedKm ? Number(f.estimatedKm) : q.estimatedKm || 0,
            passengers: Number(f.passengers),
            luggageBags: Number(f.luggage) || 0,
            acRequired: f.acRequired,
            decoration: f.decoration,
            destinationState: f.destinationState.trim() || undefined,
            specialRequests: f.specialRequests.trim() || undefined,
            couponCode: coupon || undefined,
            passengerList: f.passengerList.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), phone: p.phone.trim() || undefined })),
            travelPackageId: sp.get('travelPackageId') || undefined,
          },
        });
        id = booking.id;
        setBookingId(id);
      }
      const checkout = await api<Checkout>(`/customer/bookings/${id}/payments`, { body: { purpose: payMode } });
      const r = await pay(checkout);
      if (r.status === 'success') {
        toast.success('Payment successful — your booking is confirmed!');
        router.push(`/account/bookings/${id}?paid=1`);
      } else if (r.status === 'cancelled') {
        toast.message('Payment cancelled. Your vehicle is held for a few minutes — you can retry from here or from My bookings.');
      } else {
        toast.error(r.message);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VEHICLE_UNAVAILABLE') {
        setUnavailable(e.message);
      } else if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
        setStep(0);
        toast.error('Please review your journey details');
      } else if (e instanceof ApiError && e.status === 409 && bookingId) {
        toast.error(e.message);
        router.push(`/account/bookings/${bookingId}`);
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setPaying(false);
    }
  }

  if (vLoading) {
    return (
      <div className="container grid grid-cols-1 gap-8 py-10 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (vErr || !vehicle) {
    return (
      <div className="container max-w-xl py-16">
        <ErrorState message={vErr ?? 'Vehicle not found'} onRetry={reload} />
        <Link href="/vehicles" className="mt-4 inline-block text-sm font-semibold text-navy-700 underline">Back to search</Link>
      </div>
    );
  }

  const searchBack = `/vehicles${journeyQuery({ pickupAt: times.pickupAt, returnAt: times.returnAt, purpose: f.purpose, pickupLocation: f.pickupAddress, dropLocation: f.dropAddress, passengers: f.passengers })}`;
  const amountNow = q ? (payMode === 'FULL' ? q.quote.total : q.quote.advance) : 0;

  return (
    <div className="bg-mist-50">
      {modal}
      <div className="container py-6 md:py-10">
        <Link href={`/vehicles/${vehicle.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to vehicle
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Complete your booking</h1>

        <ol className="mt-6 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Checkout steps">
          {STEPS.map((s, i) => {
            const skipped = i === 2 && isCustomer;
            const done = i < step || (skipped && step > 2);
            return (
              <li key={s} className="flex shrink-0 items-center gap-2">
                <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-emerald-500 text-white' : i === step ? 'bg-navy-900 text-white' : 'bg-white text-slate-400 ring-1 ring-mist-300')}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={clsx('text-sm font-semibold', i === step ? 'text-navy-900' : 'text-slate-500')}>{skipped ? 'Signed in' : s}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-mist-300 sm:w-10" />}
              </li>
            );
          })}
        </ol>

        {unavailable && (
          <div className="mt-6 flex flex-wrap items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Sorry, this vehicle was just booked for your time slot.</p>
              <p>{unavailable}</p>
            </div>
            <Link href={searchBack} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">Find another vehicle</Link>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {step === 0 && (
              <section className="card p-5 md:p-7 animate-fade-up" aria-labelledby="s-journey">
                <h2 id="s-journey" className="text-lg font-semibold">Journey details</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Pickup date & time" error={errors.pickupAt} required>
                    <div className="flex gap-2">
                      <Input type="date" aria-label="Pickup date" min={istToday()} value={f.pickupDate} onChange={(e) => { set('pickupDate', e.target.value); if (f.returnDate < e.target.value) set('returnDate', e.target.value); }} invalid={!!errors.pickupAt} className="min-w-0" />
                      <Input type="time" aria-label="Pickup time" value={f.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} invalid={!!errors.pickupAt} className="w-[132px] shrink-0" />
                    </div>
                  </Field>
                  <Field label="Return date & time" error={errors.returnAt} required>
                    <div className="flex gap-2">
                      <Input type="date" aria-label="Return date" min={f.pickupDate} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} invalid={!!errors.returnAt} className="min-w-0" />
                      <Input type="time" aria-label="Return time" value={f.returnTime} onChange={(e) => set('returnTime', e.target.value)} invalid={!!errors.returnAt} className="w-[132px] shrink-0" />
                    </div>
                  </Field>
                  <Field label="Travel purpose" error={errors.purpose}>
                    <Select value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
                      {(Object.keys(PURPOSE_LABEL) as TravelPurpose[]).map((p) => (
                        <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Estimated distance (km)" hint="Total incl. return. Leave blank to auto-estimate." error={errors.estimatedKm}>
                    <Input type="number" min={0} max={20000} value={f.estimatedKm} onChange={(e) => set('estimatedKm', e.target.value)} placeholder="Auto" />
                  </Field>
                  <Field label="Pickup address" error={errors.pickupAddress} required className="sm:col-span-2">
                    <Input leading={<MapPin className="h-4 w-4" />} value={f.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} placeholder="House / landmark, area, city" maxLength={300} invalid={!!errors.pickupAddress} />
                    {addresses && addresses.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {addresses.map((a) => (
                          <button key={a.id} type="button" onClick={() => set('pickupAddress', fmtAddress(a))} className="rounded-full bg-mist-100 px-3 py-1 text-xs font-semibold text-navy-800 hover:bg-mist-200">
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Field>
                  {f.stops.map((s, i) => (
                    <Field key={i} label={`Stop ${i + 1}`} className="sm:col-span-2">
                      <div className="flex gap-2">
                        <Input value={s} onChange={(e) => set('stops', f.stops.map((x, j) => (j === i ? e.target.value : x)))} maxLength={300} placeholder="Intermediate stop" />
                        <Button variant="ghost" onClick={() => set('stops', f.stops.filter((_, j) => j !== i))} aria-label={`Remove stop ${i + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Field>
                  ))}
                  <div className="sm:col-span-2">
                    {f.stops.length < 8 && (
                      <button type="button" className="flex items-center gap-1 text-sm font-semibold text-navy-600 hover:underline" onClick={() => set('stops', [...f.stops, ''])}>
                        <Plus className="h-4 w-4" /> Add a stop
                      </button>
                    )}
                  </div>
                  <Field label="Drop address" error={errors.dropAddress} className="sm:col-span-2">
                    <Input leading={<MapPin className="h-4 w-4" />} value={f.dropAddress} onChange={(e) => set('dropAddress', e.target.value)} placeholder="Same as pickup if left blank" maxLength={300} />
                  </Field>
                  <Field label="Passengers" error={errors.passengers} hint={`Up to ${vehicle.seats}`} required>
                    <Input type="number" min={1} max={vehicle.seats} value={f.passengers} onChange={(e) => set('passengers', e.target.value)} invalid={!!errors.passengers} leading={<Users className="h-4 w-4" />} />
                  </Field>
                  <Field label="Luggage bags" error={errors.luggageBags} hint={`Boot fits about ${vehicle.luggageBags}`}>
                    <Input type="number" min={0} max={40} value={f.luggage} onChange={(e) => set('luggage', e.target.value)} invalid={!!errors.luggageBags} />
                  </Field>
                  {f.purpose === 'OUTSTATION' && (
                    <Field label="Destination state (if outside Odisha)" hint="Interstate permit tax applies" error={errors.destinationState} className="sm:col-span-2">
                      <Input value={f.destinationState} onChange={(e) => set('destinationState', e.target.value)} placeholder="e.g. Andhra Pradesh" maxLength={80} />
                    </Field>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {vehicle.driverOption === 'BOTH' && (
                    <Toggle checked={f.withDriver} onChange={(v) => set('withDriver', v)}>With driver</Toggle>
                  )}
                  {vehicle.hasAc && <Toggle checked={f.acRequired} onChange={(v) => set('acRequired', v)}>AC required</Toggle>}
                  {vehicle.decorationAvailable && (
                    <Toggle checked={f.decoration} onChange={(v) => set('decoration', v)}>
                      <Sparkles className="h-4 w-4 text-pink-600" /> Wedding decoration
                    </Toggle>
                  )}
                </div>
                <Field label="Special requests" className="mt-5" error={errors.specialRequests}>
                  <Textarea value={f.specialRequests} onChange={(e) => set('specialRequests', e.target.value)} placeholder="Child seat, elderly passengers, preferred route, flight number…" maxLength={1000} />
                </Field>

                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <p className="label !mb-0">Passenger names (optional)</p>
                    {f.passengerList.length < Number(f.passengers || 1) && (
                      <button type="button" className="flex items-center gap-1 text-sm font-semibold text-navy-600 hover:underline" onClick={() => set('passengerList', [...f.passengerList, { name: '', phone: '' }])}>
                        <Plus className="h-4 w-4" /> Add passenger
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {f.passengerList.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <div>
                          <Input aria-label={`Passenger ${i + 1} name`} placeholder="Full name" value={p.name} onChange={(e) => set('passengerList', f.passengerList.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} invalid={!!errors[`passenger_${i}`]} maxLength={120} />
                          {errors[`passenger_${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`passenger_${i}`]}</p>}
                        </div>
                        <Input aria-label={`Passenger ${i + 1} phone`} placeholder="Phone (optional)" value={p.phone} onChange={(e) => set('passengerList', f.passengerList.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} maxLength={15} />
                        <Button variant="ghost" onClick={() => set('passengerList', f.passengerList.filter((_, j) => j !== i))} aria-label={`Remove passenger ${i + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="card p-5 md:p-7 animate-fade-up" aria-labelledby="s-review">
                <h2 id="s-review" className="text-lg font-semibold">Review your trip</h2>
                <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <Item k="Pickup">{fmtDateTime(times.pickupAt)}<br /><span className="text-slate-500">{f.pickupAddress}</span></Item>
                  <Item k="Return">{fmtDateTime(times.returnAt)}<br /><span className="text-slate-500">{f.dropAddress || 'Same as pickup'}</span></Item>
                  {f.stops.filter(Boolean).length > 0 && <Item k="Stops">{f.stops.filter(Boolean).join(' → ')}</Item>}
                  <Item k="Purpose">{PURPOSE_LABEL[f.purpose as TravelPurpose]}</Item>
                  <Item k="Passengers & luggage">{f.passengers} passengers · {f.luggage || 0} bags</Item>
                  <Item k="Options">{[f.withDriver ? 'With driver' : 'Self drive', f.acRequired ? 'AC' : 'Non-AC', f.decoration ? 'Decoration' : null].filter(Boolean).join(' · ')}</Item>
                  {f.specialRequests && <Item k="Special requests">{f.specialRequests}</Item>}
                </dl>
                <button className="mt-4 text-sm font-semibold text-navy-600 hover:underline" onClick={() => setStep(0)}>Edit journey details</button>
                <div className="mt-6 border-t border-mist-200 pt-5">
                  <p className="label">Coupon</p>
                  <CouponInput base={base} applied={coupon} onChange={setCoupon} />
                  {!isCustomer && <p className="mt-1 text-xs text-slate-500">You can apply a coupon after signing in at the next step.</p>}
                </div>
                <div className="mt-6 flex items-start gap-3 rounded-2xl bg-navy-50 p-4 text-sm text-navy-900">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" />
                  <p>
                    When you continue to payment, we reserve this vehicle for <strong>{config.booking.holdMinutes} minutes</strong>. Complete the advance payment within that time to confirm — otherwise the hold is released automatically and nothing is charged.
                  </p>
                </div>
              </section>
            )}

            {step === 2 && !isCustomer && (
              <section className="card mx-auto max-w-md p-5 md:p-7 animate-fade-up" aria-labelledby="s-login">
                <h2 id="s-login" className="text-lg font-semibold">Sign in to continue</h2>
                <p className="mt-1 text-sm text-slate-500">Verify your mobile number — new customers get an account instantly.</p>
                {user && user.role !== 'CUSTOMER' ? (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">You are signed in with a {user.role.toLowerCase()} account. Please sign out and sign in with a customer account to book.</p>
                ) : (
                  <div className="mt-5">{!authLoading && <OtpLogin role="CUSTOMER" onDone={() => setStep(3)} />}</div>
                )}
              </section>
            )}

            {step === 3 && (
              <section className="card p-5 md:p-7 animate-fade-up" aria-labelledby="s-pay">
                <h2 id="s-pay" className="text-lg font-semibold">Payment</h2>
                {!q ? (
                  <Skeleton className="mt-4 h-32" />
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment option">
                      <PayOption active={payMode === 'ADVANCE'} onClick={() => setPayMode('ADVANCE')} title={`Pay advance ${inr(q.quote.advance)}`} sub={`Balance ${inr(q.quote.total - q.quote.advance)} later`} />
                      <PayOption active={payMode === 'FULL'} onClick={() => setPayMode('FULL')} title={`Pay full ${inr(q.quote.total)}`} sub="Nothing more to pay before the trip" />
                    </div>
                    <div className="mt-5 flex items-start gap-3 rounded-2xl bg-navy-50 p-4 text-sm text-navy-900">
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" />
                      <p>
                        Clicking pay creates your booking and holds the vehicle for {config.booking.holdMinutes} minutes while you complete payment.
                        {bookingId && ' Your booking is already reserved — retrying will not create a duplicate.'}
                      </p>
                    </div>
                    <Button variant="gold" size="lg" className="mt-6 w-full" onClick={placeAndPay} loading={paying} disabled={!q.available || qLoading} icon={<Lock className="h-4 w-4" />}>
                      Pay {inr(amountNow)} securely
                    </Button>
                    {!q.available && <p className="mt-2 text-sm text-red-600">This vehicle is no longer available for your time. <Link href={searchBack} className="font-semibold underline">Find another vehicle</Link></p>}
                    <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> 256-bit encrypted payments · UPI, cards, net banking
                    </p>
                    {bookingId && (
                      <p className="mt-2 text-center text-xs">
                        <Link href={`/account/bookings/${bookingId}`} className="font-semibold text-navy-600 underline">View booking</Link>
                      </p>
                    )}
                  </>
                )}
              </section>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              {step > 0 && !paying ? (
                <Button variant="outline" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < 2 && (
                <Button variant="primary" size="lg" onClick={next} disabled={step === 1 && (!q || qLoading)}>
                  {step === 1 ? (isCustomer ? 'Continue to payment' : 'Continue to sign in') : 'Review price'} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              <VehicleImage src={vehicle.images[0]?.url} alt={vehicle.title} categorySlug={vehicle.category.slug} seats={vehicle.seats} className="aspect-[16/9] w-full" />
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{vehicle.category.name}</p>
                <h2 className="text-lg font-semibold">{vehicle.title}</h2>
                <p className="text-xs text-slate-500">{vehicle.seats} seats · {vehicle.hasAc ? 'AC' : 'Non-AC'} · {vehicle.operator}</p>
                <div className="mt-4 border-t border-mist-200 pt-4">
                  {!datesValid ? (
                    <p className="text-sm text-slate-500">Choose valid future dates to see the price.</p>
                  ) : qLoading && !q ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-8" />
                    </div>
                  ) : qErr && !coupon ? (
                    <p className="text-sm text-red-600">{qErr}</p>
                  ) : q ? (
                    <div className={qLoading ? 'opacity-60' : ''}>
                      <p className={`mb-3 flex items-center gap-1.5 text-sm font-semibold ${q.available ? 'text-emerald-700' : 'text-red-600'}`}>
                        {q.available ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        {q.available ? 'Available' : 'Unavailable for these dates'}
                      </p>
                      <PriceBreakdown quote={q.quote} compact={step === 0} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
              <CreditCard className="h-4 w-4" /> Free cancellation as per policy · <Link href="/cancellation-policy" className="underline">details</Link>
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function fmtAddress(a: Address) {
  return [a.line1, a.line2, a.city, `${a.state} ${a.pincode}`].filter(Boolean).join(', ');
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition', checked ? 'border-navy-900 bg-navy-50 text-navy-900' : 'border-mist-300 text-slate-600')}>
      <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="mt-0.5 font-medium text-navy-900">{children}</dd>
    </div>
  );
}

function PayOption({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={clsx('rounded-2xl border-2 p-4 text-left transition', active ? 'border-gold-500 bg-gold-50' : 'border-mist-200 hover:border-mist-300')}>
      <span className="flex items-center justify-between">
        <span className="font-semibold text-navy-900">{title}</span>
        <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border-2', active ? 'border-gold-600 bg-gold-500 text-white' : 'border-mist-300')}>{active && <Check className="h-3 w-3" />}</span>
      </span>
      <span className="mt-1 block text-xs text-slate-500">{sub}</span>
    </button>
  );
}
