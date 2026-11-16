'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCheck, Heart, LayoutDashboard, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const LINKS = [
  { href: '/account', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/account/bookings', label: 'My bookings', icon: CalendarCheck },
  { href: '/account/weddings', label: 'Wedding requests', icon: Heart },
  { href: '/account/profile', label: 'Profile & addresses', icon: UserRound },
];

export function AccountNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <div className="border-b border-mist-200 bg-white">
      <div className="container pt-6 md:pt-8">
        <p className="text-sm text-slate-500">Welcome back,</p>
        <p className="font-display text-2xl font-semibold text-navy-900">{user?.name ?? `+91 ${user?.phone ?? ''}`}</p>
        <nav className="scrollbar-thin -mx-1 mt-4 flex gap-1 overflow-x-auto px-1" aria-label="Account">
          {LINKS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={clsx('relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-sm font-semibold transition', active ? 'text-navy-900' : 'text-slate-500 hover:text-navy-700')}
              >
                <Icon className="h-4 w-4" /> {label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold-500" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
