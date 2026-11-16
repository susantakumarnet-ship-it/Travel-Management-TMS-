'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Phone, ShieldCheck } from 'lucide-react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth, HOME_PATH } from '@/lib/auth';
import type { Me, Role } from '@/lib/types';
import { Button } from './Button';
import { Field, Input } from './Field';

/**
 * Mobile + OTP sign-in / sign-up shared by the customer site, partner portal and driver portal.
 * `role` decides which account type is created for a new number.
 */
export function OtpLogin({ role, onDone }: { role: Exclude<Role, 'ADMIN'>; onDone?: (user: Me, isNew: boolean) => void }) {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ isNewUser: boolean; devOtp?: string }>('/auth/otp/request', { body: { phone } });
      setIsNewUser(r.isNewUser);
      setDevOtp(r.devOtp ?? null);
      setStep('otp');
      setCooldown(30);
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.fieldErrors.phone || err.message : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ accessToken: string; isNew: boolean; user: Me }>('/auth/otp/verify', { body: { phone, code, role, name: name || undefined } });
      signIn(r.accessToken, r.user);
      toast.success(r.isNew ? 'Welcome to Royal Ride!' : 'Signed in');
      if (onDone) return onDone(r.user, r.isNew);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : HOME_PATH[r.user.role]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendOtp} className="space-y-4">
        <Field label="Mobile number" error={error ?? undefined}>
          <Input
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            maxLength={14}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
            leading={<span className="flex items-center gap-1 text-sm font-medium text-slate-500"><Phone className="h-4 w-4" />+91</span>}
            className="pl-20"
            required
            invalid={!!error}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Get OTP
        </Button>
        <p className="text-center text-xs text-slate-500">We will send a 6-digit code by SMS. Standard rates may apply.</p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">
        Enter the code sent to <span className="font-semibold text-navy-900">+91 {phone}</span>.{' '}
        <button type="button" className="font-semibold text-navy-600 underline" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>
          Change
        </button>
      </p>
      {devOtp && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Development mode:</strong> SMS is not configured. Your OTP is <span className="font-mono font-bold">{devOtp}</span>.
        </div>
      )}
      {isNewUser && (
        <Field label="Your full name" hint="New here? Tell us your name to create your account.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Mishra" autoComplete="name" />
        </Field>
      )}
      <Field label="One-time password" error={error ?? undefined}>
        <Input
          ref={otpRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          className="text-center font-mono text-xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
          invalid={!!error}
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={code.length !== 6} icon={<ShieldCheck className="h-4 w-4" />}>
        Verify & continue
      </Button>
      <button type="button" className="w-full text-center text-sm font-medium text-navy-600 disabled:text-slate-400" disabled={cooldown > 0 || loading} onClick={() => sendOtp()}>
        {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
      </button>
    </form>
  );
}
