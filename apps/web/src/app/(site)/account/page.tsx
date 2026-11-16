'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Bell, CalendarPlus, CheckCheck, Heart, Map, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Display';
import { ButtonLink } from '@/components/ui/Button';
import { BookingCard } from '@/components/site/BookingCard';
import type { BookingListItem, Notif } from '@/components/site/siteTypes';

export default function AccountOverview() {
  const upcoming = useApi<Paged<BookingListItem>>('/customer/bookings', { query: { scope: 'upcoming', pageSize: 3 } });
  const notifs = useApi<{ items: Notif[]; unread: number }>('/me/notifications');

  async function markAll() {
    try {
      await api('/me/notifications/read', { body: {} });
      notifs.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function markOne(id: string) {
    try {
      await api('/me/notifications/read', { body: { ids: [id] } });
      notifs.setData((d) => (d ? { unread: Math.max(0, d.unread - 1), items: d.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) } : d));
    } catch {
      /* non-critical */
    }
  }

  const actions = [
    { href: '/vehicles', label: 'Book a car', icon: CalendarPlus },
    { href: '/weddings#request', label: 'Plan a wedding', icon: Heart },
    { href: '/packages', label: 'Tour packages', icon: Map },
    { href: '/account/profile', label: 'Edit profile', icon: UserRound },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upcoming trips</h2>
            <Link href="/account/bookings" className="text-sm font-semibold text-navy-600 hover:underline">All bookings</Link>
          </div>
          {upcoming.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : upcoming.error ? (
            <ErrorState message={upcoming.error} onRetry={upcoming.reload} />
          ) : !upcoming.data?.items.length ? (
            <EmptyState title="No upcoming trips" description="Your confirmed and pending bookings will appear here." action={<ButtonLink href="/vehicles" variant="gold">Book your ride</ButtonLink>} />
          ) : (
            <div className="space-y-3">
              {upcoming.data.items.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {actions.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="card flex flex-col items-center gap-2 p-5 text-center text-sm font-semibold text-navy-900 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="rounded-xl bg-gold-50 p-3 text-gold-700"><Icon className="h-5 w-5" /></span>
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <aside>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-mist-200 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4 text-gold-600" /> Notifications
              {!!notifs.data?.unread && <span className="rounded-full bg-gold-500 px-2 text-xs text-navy-950">{notifs.data.unread}</span>}
            </h2>
            {!!notifs.data?.unread && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {notifs.loading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : notifs.error ? (
              <div className="p-5"><ErrorState message={notifs.error} onRetry={notifs.reload} /></div>
            ) : !notifs.data?.items.length ? (
              <p className="p-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-mist-100">
                {notifs.data.items.slice(0, 20).map((n) => (
                  <li key={n.id}>
                    <button onClick={() => !n.readAt && markOne(n.id)} className={clsx('w-full px-5 py-3 text-left transition hover:bg-mist-50', !n.readAt && 'bg-gold-50/50')}>
                      <p className="flex items-start gap-2 text-sm font-semibold text-navy-900">
                        {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-label="Unread" />}
                        {n.title ?? 'Update'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
