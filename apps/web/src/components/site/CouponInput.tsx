'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { QuoteInput } from './useQuote';
import type { QuoteResponse } from './siteTypes';

/** Validates a coupon against the current quote input before applying it. */
export function CouponInput({ base, applied, onChange, loginHref }: { base: QuoteInput | null; applied: string; onChange: (code: string) => void; loginHref?: string }) {
  const { user } = useAuth();
  const [code, setCode] = useState(applied);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function apply() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (!base) return setError('Choose your dates first');
    setLoading(true);
    setError(null);
    try {
      const r = await api<QuoteResponse>('/public/quote', { body: { ...base, couponCode: c, pickupAddress: base.pickupAddress || undefined, dropAddress: base.dropAddress || undefined, estimatedKm: base.estimatedKm || undefined } });
      onChange(c);
      toast.success(`Coupon applied — you save ₹${r.quote.discount.toLocaleString('en-IN')}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm ring-1 ring-inset ring-emerald-200">
        <span className="flex items-center gap-2 font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {applied} applied
        </span>
        <button
          type="button"
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          onClick={() => {
            onChange('');
            setCode('');
          }}
          aria-label="Remove coupon"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-mist-50 px-3 py-2 text-xs text-slate-600">
        <Tag className="h-4 w-4 text-gold-600" />
        Have a coupon? {loginHref ? <Link href={loginHref} className="font-semibold text-navy-700 underline">Sign in</Link> : 'Sign in'} to apply it.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void apply();
            }
          }}
          placeholder="Coupon code"
          aria-label="Coupon code"
          leading={<Tag className="h-4 w-4" />}
          maxLength={30}
          invalid={!!error}
          className="font-mono uppercase"
        />
        <Button type="button" variant="outline" onClick={apply} loading={loading} disabled={!code.trim()}>
          Apply
        </Button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
