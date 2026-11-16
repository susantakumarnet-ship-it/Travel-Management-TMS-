'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Category } from '@/lib/types';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

type EnquiryType = 'CONTACT' | 'CUSTOM_TRAVEL' | 'CORPORATE';

/**
 * POST /public/enquiries. With `travel` set, shows the "customise your trip" fields
 * (destinations, duration, passengers, preferred vehicle) which go into `meta`.
 */
export function EnquiryForm({
  type = 'CONTACT',
  travel,
  categories = [],
  defaultMessage = '',
  meta: extraMeta,
  submitLabel = 'Send enquiry',
}: {
  type?: EnquiryType;
  travel?: boolean;
  categories?: Pick<Category, 'id' | 'name' | 'slug'>[];
  defaultMessage?: string;
  meta?: Record<string, string | number | boolean>;
  submitLabel?: string;
}) {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', phone: '', email: '', message: defaultMessage, destinations: '', duration: '', passengers: '', vehicle: '', travelDate: '', kind: type });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (user) setF((s) => ({ ...s, name: s.name || user.name || '', phone: s.phone || user.phone, email: s.email || user.email || '' }));
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const meta: Record<string, string | number | boolean> = { ...(extraMeta ?? {}) };
    if (travel) {
      if (!f.destinations.trim()) return setErrors({ destinations: 'Tell us where you would like to go' });
      meta.destinations = f.destinations.trim();
      if (f.duration) meta.durationDays = Number(f.duration);
      if (f.passengers) meta.passengers = Number(f.passengers);
      if (f.vehicle) meta.preferredVehicle = f.vehicle;
      if (f.travelDate) meta.travelDate = f.travelDate;
    }
    const message =
      f.message.trim() ||
      (travel ? `Custom trip request: ${f.destinations}${f.duration ? `, ${f.duration} days` : ''}${f.passengers ? `, ${f.passengers} passengers` : ''}.` : '');
    setLoading(true);
    try {
      await api('/public/enquiries', { body: { type: travel ? 'CUSTOM_TRAVEL' : f.kind, name: f.name, phone: f.phone, email: f.email, message, meta: Object.keys(meta).length ? meta : undefined } });
      setDone(true);
      toast.success('Thank you! Our travel desk will call you shortly.');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-emerald-50 px-6 py-10 text-center ring-1 ring-emerald-200">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <p className="mt-3 text-lg font-semibold text-navy-900">Enquiry received</p>
        <p className="mt-1 max-w-sm text-sm text-slate-600">Our team usually responds within 30 minutes between 7 AM and 11 PM.</p>
        <button
          className="mt-4 text-sm font-semibold text-navy-700 underline"
          onClick={() => {
            setDone(false);
            setF((s) => ({ ...s, message: defaultMessage, destinations: '', duration: '', passengers: '', vehicle: '', travelDate: '' }));
          }}
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name" error={errors.name} required>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required invalid={!!errors.name} maxLength={120} />
        </Field>
        <Field label="Mobile number" error={errors.phone} required>
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" required invalid={!!errors.phone} maxLength={14} />
        </Field>
        <Field label="Email (optional)" error={errors.email} className={travel ? '' : 'sm:col-span-2'}>
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" invalid={!!errors.email} />
        </Field>
        {!travel && type === 'CONTACT' && (
          <Field label="Enquiry about" className="sm:col-span-2">
            <Select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="CONTACT">General / booking help</option>
              <option value="CUSTOM_TRAVEL">Custom trip or tour</option>
              <option value="CORPORATE">Corporate travel</option>
            </Select>
          </Field>
        )}
        {travel && (
          <>
            <Field label="Travel date">
              <Input type="date" value={f.travelDate} onChange={(e) => set('travelDate', e.target.value)} />
            </Field>
            <Field label="Destinations" error={errors.destinations} required className="sm:col-span-2">
              <Input value={f.destinations} onChange={(e) => set('destinations', e.target.value)} placeholder="e.g. Puri, Konark, Chilika, Gopalpur" invalid={!!errors.destinations} maxLength={200} />
            </Field>
            <Field label="Duration (days)">
              <Input type="number" min={1} max={30} value={f.duration} onChange={(e) => set('duration', e.target.value)} />
            </Field>
            <Field label="Passengers">
              <Input type="number" min={1} max={60} value={f.passengers} onChange={(e) => set('passengers', e.target.value)} />
            </Field>
            <Field label="Preferred vehicle" className="sm:col-span-2">
              <Select value={f.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
                <option value="">No preference</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label={travel ? 'Anything else? (optional)' : 'Message'} error={errors.message} required={!travel} className="sm:col-span-2">
          <Textarea value={f.message} onChange={(e) => set('message', e.target.value)} placeholder={travel ? 'Hotels, special stops, elderly travellers…' : 'Tell us about your trip or question'} invalid={!!errors.message} maxLength={3000} />
        </Field>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={loading} icon={<Send className="h-4 w-4" />} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}
