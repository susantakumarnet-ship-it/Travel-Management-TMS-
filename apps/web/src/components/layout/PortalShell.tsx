'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Logo } from './Logo';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Hide when the predicate returns false (e.g. permission checks). */
  show?: boolean;
  badge?: number;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

interface Notif {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ items: Notif[]; unread: number }>('/me/notifications');
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  async function markAll() {
    await api('/me/notifications/read', { body: {} });
    reload();
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl p-2 text-slate-600 hover:bg-mist-100" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {!!data?.unread && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-mist-200 bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-mist-200 px-4 py-3">
              <span className="text-sm font-semibold text-navy-900">Notifications</span>
              {!!data?.unread && (
                <button onClick={markAll} className="text-xs font-semibold text-navy-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {!data?.items.length && <p className="px-4 py-10 text-center text-sm text-slate-500">You are all caught up.</p>}
              {data?.items.map((n) => (
                <div key={n.id} className={clsx('border-b border-mist-100 px-4 py-3 text-sm', !n.readAt && 'bg-gold-50/60')}>
                  {n.title && <p className="font-semibold text-navy-900">{n.title}</p>}
                  <p className="mt-0.5 whitespace-pre-line text-slate-600">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Sidebar + topbar layout shared by the admin, partner (owner) and driver portals. */
export function PortalShell({ title, nav, children, homeHref }: { title: string; nav: NavGroup[]; children: ReactNode; homeHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === homeHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
        <Link href={homeHref} className="flex items-center gap-2">
          <Logo className="h-8" dark />
        </Link>
        <span className="ml-auto rounded-md bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-300">{title}</span>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-5 scrollbar-thin">
        {nav.map((g, gi) => {
          const items = g.items.filter((i) => i.show !== false);
          if (!items.length) return null;
          return (
            <div key={gi}>
              {g.title && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-navy-300/70">{g.title}</p>}
              <ul className="space-y-0.5">
                {items.map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                        isActive(i.href) ? 'bg-white/10 text-white shadow-inner' : 'text-navy-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className={clsx('[&>svg]:h-[18px] [&>svg]:w-[18px]', isActive(i.href) ? 'text-gold-400' : 'text-navy-300')}>{i.icon}</span>
                      <span className="flex-1">{i.label}</span>
                      {!!i.badge && <span className="rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-navy-950">{i.badge}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-sheen text-sm font-bold text-navy-950">{(user?.name ?? user?.phone ?? '?').slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name ?? 'User'}</p>
            <p className="truncate text-xs text-navy-300">{user?.email ?? user?.phone}</p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.replace('/');
            }}
            className="rounded-lg p-2 text-navy-300 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-mist-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-lift">{sidebar}</aside>
          <button className="absolute right-4 top-4 rounded-full bg-white p-2" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-mist-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <button className="rounded-xl p-2 text-slate-600 hover:bg-mist-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo className="h-7" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-mist-100 sm:block">
              View website
            </Link>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
