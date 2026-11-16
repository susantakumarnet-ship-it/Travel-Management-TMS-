'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, IndianRupee, Navigation, Route, Star, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { inr } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Display';
import { Banner } from '@/components/partner/common';
import { DeclineModal, TripCard } from '@/components/partner/TripCard';
import type { DriverTrip } from '@/components/partner/types';

interface Dashboard {
  driver: { isAvailable: boolean; verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED'; verificationNote: string | null };
  pending: DriverTrip[];
  upcoming: DriverTrip[];
  current: DriverTrip | null;
  stats: { monthTrips: number; monthEarnings: number; totalEarnings: number; totalTrips: number; rating: number };
}

export default function DriverHome() {
  const { user, reload: reloadMe } = useAuth();
  const { data, error, loading, reload } = useApi<Dashboard>('/driver/dashboard');
  const [toggling, setToggling] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<DriverTrip | null>(null);
  const available = data?.driver.isAvailable ?? user?.driver?.isAvailable ?? false;
  const status = data?.driver.verificationStatus ?? user?.driver?.verificationStatus ?? 'PENDING';

  async function toggle() {
    setToggling(true);
    try {
      await api('/driver/availability', { method: 'PATCH', body: { isAvailable: !available } });
      toast.success(!available ? 'You are now available for trips' : 'You are now off duty');
      reload();
      reloadMe().catch(() => undefined);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToggling(false);
    }
  }

  async function respond(t: DriverTrip, accept: boolean, note?: string) {
    setResponding(t.id);
    try {
      await api(`/driver/trips/${t.id}/respond`, { body: { accept, note } });
      toast.success(accept ? 'Trip accepted' : 'Trip declined');
      setDeclineFor(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setResponding(null);
    }
  }

  const pendingIds = new Set(data?.pending.map((p) => p.id));
  const upcoming = data?.upcoming.filter((u) => !pendingIds.has(u.id)) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Namaskar,</p>
          <h1 className="text-2xl font-bold text-navy-900">{user?.name ?? 'Driver'}</h1>
        </div>
      </div>

      {status === 'PENDING' && (
        <Banner tone="amber" title="Verification pending" action={<Link href="/driver/profile" className="text-sm font-semibold underline">Documents</Link>}>
          You will start receiving trips once our team verifies your licence and ID.
        </Banner>
      )}
      {status === 'REJECTED' && (
        <Banner tone="red" title="Verification unsuccessful" action={<Link href="/driver/profile" className="text-sm font-semibold underline">Fix</Link>}>
          {data?.driver.verificationNote ?? 'Please re-upload clear documents from your profile.'}
        </Banner>
      )}

      {/* Availability */}
      <button
        onClick={toggle}
        disabled={toggling}
        className={clsx(
          'mb-6 flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-card transition active:scale-[.99] disabled:opacity-70',
          available ? 'bg-emerald-600 text-white' : 'bg-white text-navy-900 ring-1 ring-mist-200',
        )}
        role="switch"
        aria-checked={available}
      >
        <span className="flex-1">
          <span className="block text-lg font-bold">{available ? 'You are available' : 'You are off duty'}</span>
          <span className={clsx('block text-sm', available ? 'text-emerald-50' : 'text-slate-500')}>{available ? 'Tap to go off duty' : 'Tap to start receiving trips'}</span>
        </span>
        <span className={clsx('relative h-9 w-16 shrink-0 rounded-full transition', available ? 'bg-white/30' : 'bg-mist-300')}>
          <span className={clsx('absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all', available ? 'left-8' : 'left-1')} />
        </span>
      </button>

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      ) : data ? (
        <div className="space-y-8">
          {data.current && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold-700">Current trip</h2>
              <TripCard
                t={data.current}
                highlight
                actions={
                  <Link href={`/driver/trips/${data.current.id}`} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-navy-900 font-semibold text-white">
                    <Navigation className="h-4 w-4" /> Open trip
                  </Link>
                }
              />
            </section>
          )}

          {data.pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">New assignments ({data.pending.length})</h2>
              <div className="space-y-3">
                {data.pending.map((t) => (
                  <TripCard
                    key={t.id}
                    t={t}
                    highlight
                    actions={
                      <>
                        <Button variant="outline" size="lg" className="flex-1 text-red-600" disabled={responding === t.id} onClick={() => setDeclineFor(t)} icon={<X className="h-5 w-5" />}>
                          Decline
                        </Button>
                        <Button variant="primary" size="lg" className="flex-1" loading={responding === t.id} onClick={() => respond(t, true)} icon={<Check className="h-5 w-5" />}>
                          Accept
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700">Upcoming trips</h2>
              <Link href="/driver/trips" className="text-sm font-semibold text-navy-600">
                All trips
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming trips" description={available ? 'New assignments will appear here.' : 'Turn on availability to receive trips.'} icon={<Route className="h-6 w-6" />} />
            ) : (
              <div className="space-y-3">
                {upcoming.map((t) => (
                  <TripCard key={t.id} t={t} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">Your stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Trips this month" value={String(data.stats.monthTrips)} icon={<Route className="h-5 w-5" />} />
              <Stat label="Earned this month" value={inr(data.stats.monthEarnings)} icon={<IndianRupee className="h-5 w-5" />} />
              <Stat label="Total earnings" value={inr(data.stats.totalEarnings)} hint={`${data.stats.totalTrips} trips`} icon={<IndianRupee className="h-5 w-5" />} />
              <Stat label="Rating" value={Number(data.stats.rating) > 0 ? Number(data.stats.rating).toFixed(1) : '—'} icon={<Star className="h-5 w-5" />} />
            </div>
          </section>
        </div>
      ) : null}

      <DeclineModal trip={declineFor} onClose={() => setDeclineFor(null)} busy={!!responding} onConfirm={(note) => declineFor && respond(declineFor, false, note)} />
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-2 inline-flex rounded-lg bg-gold-50 p-2 text-gold-700">{icon}</div>
      <p className="text-xl font-bold text-navy-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
