'use client';

import Link from 'next/link';
import { Suspense, useEffect, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, HOME_PATH } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { OtpLogin } from '@/components/ui/OtpLogin';
import { Spinner } from '@/components/ui/Spinner';
import { PublicHeader } from './common';

interface Props {
  role: 'OWNER' | 'DRIVER';
  title: string;
  subtitle: string;
  aside: ReactNode;
  footer?: ReactNode;
}

function destination(u: Me, role: 'OWNER' | 'DRIVER', next: string | null) {
  if (u.role !== role) return HOME_PATH[u.role];
  const hasProfile = role === 'OWNER' ? !!u.owner : !!u.driver;
  const base = role === 'OWNER' ? '/owner' : '/driver';
  if (!hasProfile) return `${base}/onboarding`;
  return next && next.startsWith(base) ? next : base;
}

function Inner({ role, title, subtitle, aside, footer }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  useEffect(() => {
    if (!loading && user) router.replace(destination(user, role, next));
  }, [loading, user, role, next, router]);

  return (
    <div className="min-h-screen bg-navy-deep">
      <PublicHeader />
      <div className="container grid grid-cols-1 gap-10 py-10 md:py-16 lg:grid-cols-2 lg:items-center">
        <div className="hidden text-white lg:block">{aside}</div>
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl bg-white p-6 shadow-lift sm:p-8">
            <h1 className="font-display text-2xl font-semibold text-navy-900">{title}</h1>
            <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
            {loading || user ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-7 w-7 text-navy-700" />
              </div>
            ) : (
              <OtpLogin role={role} onDone={(u) => router.replace(destination(u, role, next))} />
            )}
          </div>
          {footer && <div className="mt-5 text-center text-sm text-navy-100">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function PortalLogin(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-navy-deep">
          <Spinner className="h-8 w-8 text-gold-400" />
        </div>
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}

export function LoginFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-gold-300 hover:underline">
      {children}
    </Link>
  );
}
