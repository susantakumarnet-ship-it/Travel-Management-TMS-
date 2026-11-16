'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, IndianRupee, Route, UserCircle } from 'lucide-react';
import { RequireRole, useAuth } from '@/lib/auth';
import { PortalShell, type NavGroup } from '@/components/layout/PortalShell';
import { Spinner } from '@/components/ui/Spinner';

const ITEMS = [
  { href: '/driver', label: 'Home', icon: Home },
  { href: '/driver/trips', label: 'Trips', icon: Route },
  { href: '/driver/earnings', label: 'Earnings', icon: IndianRupee },
  { href: '/driver/profile', label: 'Profile', icon: UserCircle },
];

function DriverPortal({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const driver = user?.driver;

  useEffect(() => {
    if (user && !driver) router.replace('/driver/onboarding');
  }, [user, driver, router]);

  if (!driver) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-navy-700" />
      </div>
    );
  }

  const nav: NavGroup[] = [{ items: ITEMS.map((i) => ({ href: i.href, label: i.label, icon: <i.icon /> })) }];
  const onTripPage = /^\/driver\/trips\/[^/]+$/.test(pathname);
  const active = (href: string) => (href === '/driver' ? pathname === href : pathname.startsWith(href));

  return (
    <PortalShell title="Driver" nav={nav} homeHref="/driver">
      <div className={clsx(!onTripPage && 'pb-20 lg:pb-0')}>{children}</div>
      {!onTripPage && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-mist-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Driver navigation">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className={clsx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', active(i.href) ? 'text-navy-900' : 'text-slate-400')}>
              <i.icon className={clsx('h-6 w-6', active(i.href) && 'text-gold-600')} />
              {i.label}
            </Link>
          ))}
        </nav>
      )}
    </PortalShell>
  );
}

export default function DriverLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="DRIVER">
      <DriverPortal>{children}</DriverPortal>
    </RequireRole>
  );
}
