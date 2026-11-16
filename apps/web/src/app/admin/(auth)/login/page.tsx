'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

function LoginForm() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next');
  const dest = next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user?.role === 'ADMIN') router.replace(dest);
  }, [loading, user, router, dest]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    setBusy(true);
    try {
      const r = await api<{ accessToken: string; user: Me }>('/auth/admin/login', { method: 'POST', body: { email: email.trim(), password } });
      signIn(r.accessToken, r.user);
      router.replace(dest);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="mb-8 flex justify-center">
        <Logo className="h-11" dark />
      </div>
      <div className="rounded-3xl border border-white/10 bg-white p-7 shadow-lift md:p-9">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-gold-50 p-2.5 text-gold-700 ring-1 ring-gold-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy-900">Admin console</h1>
            <p className="text-sm text-slate-500">Sign in with your staff credentials</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email}>
            <Input type="email" autoComplete="username" leading={<Mail className="h-4 w-4" />} value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@royalride.in" required autoFocus />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input type="password" autoComplete="current-password" leading={<Lock className="h-4 w-4" />} value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
          </Field>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">Access is logged and restricted to authorised Royal Ride staff.</p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-deep px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-navy-400/20 blur-3xl" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
