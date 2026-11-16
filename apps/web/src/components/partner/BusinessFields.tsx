'use client';

import { Card, CardHeader } from '@/components/ui/Display';
import { Field, Input, Textarea } from '@/components/ui/Field';
import type { OwnerProfile } from './types';

export interface OwnerForm {
  businessName: string;
  contactPerson: string;
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  panNumber: string;
  gstin: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiId: string;
}

export function ownerFormFrom(p: OwnerProfile | null, fallbackName?: string | null): OwnerForm {
  return {
    businessName: p?.businessName ?? '',
    contactPerson: p?.contactPerson ?? '',
    name: p?.user.name ?? fallbackName ?? '',
    email: p?.user.email ?? '',
    address: p?.address ?? '',
    city: p?.city ?? '',
    state: p?.state ?? 'Odisha',
    panNumber: p?.panNumber ?? '',
    gstin: p?.gstin ?? '',
    bankAccountName: p?.bankAccountName ?? '',
    bankAccountNumber: p?.bankAccountNumber ?? '',
    bankIfsc: p?.bankIfsc ?? '',
    upiId: p?.upiId ?? '',
  };
}

/** Business, tax and payout-account fields shared by onboarding and the profile page. */
export function BusinessFields({ form, set, errors }: { form: OwnerForm; set: (k: keyof OwnerForm, v: string) => void; errors: Record<string, string> }) {
  const text = (k: keyof OwnerForm, label: string, opts: { hint?: string; required?: boolean; upper?: boolean; placeholder?: string; className?: string; inputMode?: 'numeric' | 'email' } = {}) => (
    <Field label={label} hint={opts.hint} error={errors[k]} required={opts.required} className={opts.className}>
      <Input
        value={form[k]}
        onChange={(e) => set(k, opts.upper ? e.target.value.toUpperCase() : e.target.value)}
        invalid={!!errors[k]}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        className={opts.upper ? 'uppercase' : undefined}
      />
    </Field>
  );
  return (
    <>
      <Card>
        <CardHeader title="Business" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('businessName', 'Business / travels name', { required: true, placeholder: 'e.g. Jagannath Tours & Travels', className: 'sm:col-span-2' })}
          {text('name', 'Your full name')}
          {text('contactPerson', 'Contact person', { hint: 'If different from you' })}
          {text('email', 'Email', { inputMode: 'email', placeholder: 'you@business.com' })}
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          {text('city', 'City', { placeholder: 'Bhubaneswar' })}
          {text('state', 'State')}
        </div>
      </Card>
      <Card>
        <CardHeader title="Tax details" subtitle="PAN is required for payouts. GSTIN is optional." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('panNumber', 'PAN', { upper: true, placeholder: 'ABCDE1234F' })}
          {text('gstin', 'GSTIN', { upper: true, placeholder: '21ABCDE1234F1Z5' })}
        </div>
      </Card>
      <Card>
        <CardHeader title="Payout account" subtitle="Settlements are paid to this account. Changing bank details triggers re-verification." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('bankAccountName', 'Account holder name', { className: 'sm:col-span-2' })}
          {text('bankAccountNumber', 'Account number', { inputMode: 'numeric' })}
          {text('bankIfsc', 'IFSC', { upper: true, placeholder: 'SBIN0001234' })}
          {text('upiId', 'UPI ID', { hint: 'Optional', placeholder: 'name@bank' })}
        </div>
      </Card>
    </>
  );
}
