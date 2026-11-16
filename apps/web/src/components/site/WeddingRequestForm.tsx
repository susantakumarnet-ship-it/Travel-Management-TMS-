'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { CalendarHeart, CheckCircle2, FileUp, MapPin, PartyPopper, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr, istToday } from '@/lib/format';
import type { Category } from '@/lib/types';
import { Field, Input, Textarea, Segmented } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Display';
import { OtpLogin } from '@/components/ui/OtpLogin';
import type { WeddingPackage, WeddingRequest } from './siteTypes';

interface Pickup { label: string; address: string; pickupTime: string; passengers: string }
interface EventRow { name: string; date: string; vehicles: string; notes: string }

const MAX_FILE = 8 * 1024 * 1024;
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png'];

export function WeddingRequestForm({ packages, categories, initialPackage }: { packages: WeddingPackage[]; categories: Category[]; initialPackage?: string }) {
  const { user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const [f, setF] = useState({
    packageId: initialPackage ?? '',
    weddingDate: '',
    venueName: '',
    venueAddress: '',
    dropLocation: '',
    totalVehicles: '2',
    brideCar: true,
    groomCar: true,
    decoratedCars: '1',
    guestVehicles: '0',
    guestCount: '',
    preferredCategoryIds: [] as string[],
    rentalMode: 'FULL_DAY' as 'FULL_DAY' | 'HOURLY',
    hours: '8',
    decorationRequest: '',
    notes: '',
  });
  const [pickups, setPickups] = useState<Pickup[]>([{ label: "Groom's residence", address: '', pickupTime: '', passengers: '' }]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [done, setDone] = useState<WeddingRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (initialPackage) setF((s) => ({ ...s, packageId: initialPackage }));
  }, [initialPackage]);

  const selectedPkg = packages.find((p) => p.id === f.packageId);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!f.weddingDate) e.weddingDate = 'Choose the wedding date';
    else if (f.weddingDate < istToday()) e.weddingDate = 'Wedding date must be in the future';
    if (f.venueName.trim().length < 2) e.venueName = 'Enter the venue name';
    if (f.venueAddress.trim().length < 3) e.venueAddress = 'Enter the venue address';
    const total = Number(f.totalVehicles);
    if (!total || total < 1 || total > 100) e.totalVehicles = 'Between 1 and 100 vehicles';
    if (Number(f.decoratedCars) > 50) e.decoratedCars = 'Up to 50 decorated cars';
    if (f.rentalMode === 'HOURLY' && (Number(f.hours) < 2 || Number(f.hours) > 24)) e.hours = 'Between 2 and 24 hours';
    pickups.forEach((p, i) => {
      if (p.address.trim().length < 3 && (p.label || p.pickupTime || p.passengers)) e[`pickup_${i}`] = 'Enter an address or remove this pickup point';
    });
    events.forEach((ev, i) => {
      if (!ev.name.trim()) e[`event_${i}`] = 'Name the event or remove it';
      else if (!ev.date) e[`event_${i}`] = 'Choose the event date';
    });
    if (file && !ACCEPT.includes(file.type)) e.itinerary = 'Upload a PDF, JPG or PNG file';
    if (file && file.size > MAX_FILE) e.itinerary = 'File must be under 8 MB';
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields');
      const first = document.querySelector('[data-invalid="true"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  async function submit() {
    setLoading(true);
    try {
      const data = {
        packageId: f.packageId || undefined,
        weddingDate: f.weddingDate,
        venueName: f.venueName.trim(),
        venueAddress: f.venueAddress.trim(),
        dropLocation: f.dropLocation.trim() || undefined,
        rentalMode: f.rentalMode,
        hours: f.rentalMode === 'HOURLY' ? Number(f.hours) : undefined,
        totalVehicles: Number(f.totalVehicles),
        brideCar: f.brideCar,
        groomCar: f.groomCar,
        guestVehicles: Number(f.guestVehicles) || 0,
        guestCount: f.guestCount ? Number(f.guestCount) : undefined,
        decoratedCars: Number(f.decoratedCars) || 0,
        preferredCategoryIds: f.preferredCategoryIds,
        decorationRequest: f.decorationRequest.trim() || undefined,
        events: events.map((e) => ({ name: e.name.trim(), date: e.date, vehicles: Number(e.vehicles) || 1, notes: e.notes.trim() || undefined })),
        pickupPoints: pickups
          .filter((p) => p.address.trim())
          .map((p) => ({ label: p.label.trim() || undefined, address: p.address.trim(), pickupTime: p.pickupTime || undefined, passengers: p.passengers ? Number(p.passengers) : undefined })),
        notes: f.notes.trim() || undefined,
      };
      const fd = new FormData();
      fd.append('data', JSON.stringify(data));
      if (file) fd.append('itinerary', file);
      const w = await api<WeddingRequest>('/customer/weddings', { method: 'POST', body: fd });
      setDone(w);
      toast.success(`Wedding request ${w.requestNumber} submitted`);
      window.scrollTo({ top: (document.getElementById('request')?.offsetTop ?? 0) - 80, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
        toast.error('Please review the highlighted fields');
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!isCustomer) {
      setLoginOpen(true);
      return;
    }
    void submit();
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center p-8 text-center md:p-12 animate-fade-up">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <PartyPopper className="h-8 w-8 text-emerald-600" />
        </span>
        <h3 className="mt-4 font-display text-2xl font-semibold">Request received!</h3>
        <p className="mt-2 text-slate-600">Your wedding request number is</p>
        <p className="mt-1 rounded-xl bg-gold-50 px-4 py-2 font-mono text-xl font-bold tracking-wider text-gold-800 ring-1 ring-gold-200">{done.requestNumber}</p>
        <p className="mt-4 max-w-md text-sm text-slate-600">Our wedding desk will review your requirements and send an itemised quote to your account. You&apos;ll get an SMS when it&apos;s ready.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/account/weddings" className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">Track my request</Link>
          <button className="rounded-xl border border-mist-300 px-5 py-2.5 text-sm font-semibold text-navy-900" onClick={() => setDone(null)}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="card space-y-8 p-5 md:p-8" noValidate>
        <Section title="Package">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <PkgOption active={!f.packageId} onClick={() => set('packageId', '')} title="Custom" sub="Build my own" />
            {packages.map((p) => (
              <PkgOption key={p.id} active={f.packageId === p.id} onClick={() => set('packageId', p.id)} title={p.name} sub={`from ${inr(p.basePrice)}`} />
            ))}
          </div>
          {selectedPkg && <p className="mt-2 text-xs text-slate-500">{selectedPkg.vehicleCount} vehicle(s), {selectedPkg.includedHours} hrs, {selectedPkg.includedKm} km included{selectedPkg.decorationIncluded ? ', decoration included' : ''}.</p>}
        </Section>

        <Section title="Wedding & venue">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Wedding date" error={errors.weddingDate} required>
              <Input type="date" min={istToday()} value={f.weddingDate} onChange={(e) => set('weddingDate', e.target.value)} invalid={!!errors.weddingDate} data-invalid={!!errors.weddingDate} leading={<CalendarHeart className="h-4 w-4" />} />
            </Field>
            <Field label="Venue name" error={errors.venueName} required>
              <Input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} placeholder="e.g. Mayfair Convention" maxLength={200} invalid={!!errors.venueName} data-invalid={!!errors.venueName} />
            </Field>
            <Field label="Venue address" error={errors.venueAddress} required className="sm:col-span-2">
              <Input value={f.venueAddress} onChange={(e) => set('venueAddress', e.target.value)} placeholder="Full address of the venue" maxLength={300} invalid={!!errors.venueAddress} data-invalid={!!errors.venueAddress} leading={<MapPin className="h-4 w-4" />} />
            </Field>
            <Field label="Drop location (after ceremony)" error={errors.dropLocation} className="sm:col-span-2">
              <Input value={f.dropLocation} onChange={(e) => set('dropLocation', e.target.value)} placeholder="e.g. Bride's residence" maxLength={300} />
            </Field>
          </div>
        </Section>

        <Section title="Vehicles">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Total vehicles" error={errors.totalVehicles} required>
              <Input type="number" min={1} max={100} value={f.totalVehicles} onChange={(e) => set('totalVehicles', e.target.value)} invalid={!!errors.totalVehicles} data-invalid={!!errors.totalVehicles} />
            </Field>
            <Field label="Decorated cars" error={errors.decoratedCars}>
              <Input type="number" min={0} max={50} value={f.decoratedCars} onChange={(e) => set('decoratedCars', e.target.value)} invalid={!!errors.decoratedCars} />
            </Field>
            <Field label="Guest vehicles" error={errors.guestVehicles}>
              <Input type="number" min={0} max={100} value={f.guestVehicles} onChange={(e) => set('guestVehicles', e.target.value)} />
            </Field>
            <Field label="Approx. guests to move" error={errors.guestCount}>
              <Input type="number" min={0} max={5000} value={f.guestCount} onChange={(e) => set('guestCount', e.target.value)} placeholder="Optional" />
            </Field>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <ToggleChip checked={f.brideCar} onChange={(v) => set('brideCar', v)}>Bride car</ToggleChip>
              <ToggleChip checked={f.groomCar} onChange={(v) => set('groomCar', v)}>Groom car</ToggleChip>
            </div>
          </div>
          <div className="mt-4">
            <p className="label">Preferred categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = f.preferredCategoryIds.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={on}
                    onClick={() => set('preferredCategoryIds', on ? f.preferredCategoryIds.filter((x) => x !== c.id) : [...f.preferredCategoryIds, c.id].slice(0, 10))}
                    className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold transition', on ? 'bg-navy-900 text-white' : 'bg-mist-100 text-slate-700 hover:bg-mist-200')}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <p className="label">Rental</p>
              <Segmented value={f.rentalMode} onChange={(v) => set('rentalMode', v)} options={[{ value: 'FULL_DAY', label: 'Full day' }, { value: 'HOURLY', label: 'Hourly' }]} />
            </div>
            {f.rentalMode === 'HOURLY' && (
              <Field label="Hours" error={errors.hours} className="w-32">
                <Input type="number" min={2} max={24} value={f.hours} onChange={(e) => set('hours', e.target.value)} invalid={!!errors.hours} data-invalid={!!errors.hours} />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Pickup points" action={pickups.length < 20 && <AddBtn onClick={() => setPickups([...pickups, { label: '', address: '', pickupTime: '', passengers: '' }])}>Add pickup</AddBtn>}>
          {errors.pickupPoints && <p className="mb-2 text-xs text-red-600">{errors.pickupPoints}</p>}
          <div className="space-y-3">
            {pickups.map((p, i) => (
              <div key={i} className="rounded-2xl border border-mist-200 p-3" data-invalid={!!errors[`pickup_${i}`]}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
                  <Input aria-label={`Pickup ${i + 1} label`} placeholder="Label (e.g. Hotel)" value={p.label} maxLength={80} onChange={(e) => setPickups(pickups.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input aria-label={`Pickup ${i + 1} address`} placeholder="Address" value={p.address} maxLength={300} invalid={!!errors[`pickup_${i}`]} onChange={(e) => setPickups(pickups.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} />
                </div>
                <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input type="time" aria-label={`Pickup ${i + 1} time`} value={p.pickupTime} onChange={(e) => setPickups(pickups.map((x, j) => (j === i ? { ...x, pickupTime: e.target.value } : x)))} />
                  <Input type="number" min={0} max={500} aria-label={`Pickup ${i + 1} passengers`} placeholder="Passengers" value={p.passengers} onChange={(e) => setPickups(pickups.map((x, j) => (j === i ? { ...x, passengers: e.target.value } : x)))} />
                  <Button variant="ghost" onClick={() => setPickups(pickups.filter((_, j) => j !== i))} aria-label={`Remove pickup ${i + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {errors[`pickup_${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`pickup_${i}`]}</p>}
              </div>
            ))}
            {pickups.length === 0 && <p className="text-sm text-slate-500">No pickup points added.</p>}
          </div>
        </Section>

        <Section title="Pre / post-wedding events" action={events.length < 10 && <AddBtn onClick={() => setEvents([...events, { name: '', date: '', vehicles: '1', notes: '' }])}>Add event</AddBtn>}>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">Need cars for Haldi, Sangeet, reception or the bidaai? Add each event here.</p>
          ) : (
            <div className="space-y-3">
              {events.map((ev, i) => (
                <div key={i} className="rounded-2xl border border-mist-200 p-3" data-invalid={!!errors[`event_${i}`]}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.3fr_1fr_auto]">
                    <Input aria-label={`Event ${i + 1} name`} placeholder="Event (e.g. Sangeet)" value={ev.name} maxLength={80} invalid={!!errors[`event_${i}`]} onChange={(e) => setEvents(events.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Input type="date" aria-label={`Event ${i + 1} date`} value={ev.date} onChange={(e) => setEvents(events.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                    <Input type="number" min={1} max={100} aria-label={`Event ${i + 1} vehicles`} placeholder="Vehicles" value={ev.vehicles} onChange={(e) => setEvents(events.map((x, j) => (j === i ? { ...x, vehicles: e.target.value } : x)))} />
                    <Button variant="ghost" onClick={() => setEvents(events.filter((_, j) => j !== i))} aria-label={`Remove event ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input className="mt-2" aria-label={`Event ${i + 1} notes`} placeholder="Notes (optional)" value={ev.notes} maxLength={300} onChange={(e) => setEvents(events.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))} />
                  {errors[`event_${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`event_${i}`]}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Decoration, itinerary & notes">
          <div className="grid gap-4">
            <Field label="Custom decoration request" error={errors.decorationRequest}>
              <Textarea value={f.decorationRequest} onChange={(e) => set('decorationRequest', e.target.value)} placeholder="Flower types, colours, ribbons, name boards…" maxLength={1000} />
            </Field>
            <Field label="Itinerary file (PDF, JPG or PNG, max 8 MB)" error={errors.itinerary}>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" id="itinerary" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <div className="flex items-center justify-between rounded-xl border border-mist-200 bg-mist-50 px-3 py-2.5 text-sm">
                  <span className="truncate font-medium text-navy-900">{file.name} <span className="text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="rounded p-1 text-slate-500 hover:bg-mist-200" aria-label="Remove file">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label htmlFor="itinerary" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-mist-300 px-4 py-6 text-sm font-semibold text-navy-700 transition hover:border-gold-400 hover:bg-gold-50/40">
                  <FileUp className="h-5 w-5" /> Choose a file to upload
                </label>
              )}
            </Field>
            <Field label="Additional notes" error={errors.notes}>
              <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Baraat timing, convoy order, special guests…" maxLength={2000} />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col gap-3 border-t border-mist-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{isCustomer ? `Submitting as ${user?.name ?? '+91 ' + user?.phone}` : 'You will be asked to verify your mobile number.'}</p>
          <Button type="submit" variant="gold" size="lg" loading={loading} icon={<CheckCircle2 className="h-5 w-5" />}>
            Submit wedding request
          </Button>
        </div>
      </form>

      <Modal open={loginOpen} onClose={() => setLoginOpen(false)} title="Verify your mobile to submit" size="sm">
        <p className="mb-4 text-sm text-slate-600">We&apos;ll save your wedding request to your account so you can track the quote.</p>
        <Suspense fallback={null}>
          <OtpLogin
            role="CUSTOMER"
            onDone={(u) => {
              setLoginOpen(false);
              if (u.role === 'CUSTOMER') void submit();
              else toast.error('Please sign in with a customer account');
            }}
          />
        </Suspense>
      </Modal>
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset>
      <div className="mb-3 flex items-center justify-between gap-3">
        <legend className="font-display text-lg font-semibold text-navy-900">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-sm font-semibold text-navy-600 hover:underline">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

function ToggleChip({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={clsx('flex h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium transition', checked ? 'border-pink-300 bg-pink-50 text-pink-900' : 'border-mist-300 text-slate-600')}>
      <input type="checkbox" className="h-4 w-4 accent-pink-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function PkgOption({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx('rounded-xl border-2 px-3 py-2.5 text-left transition', active ? 'border-gold-500 bg-gold-50' : 'border-mist-200 hover:border-mist-300')}>
      <span className="block text-sm font-semibold text-navy-900">{title}</span>
      <span className="block text-xs text-slate-500">{sub}</span>
    </button>
  );
}
