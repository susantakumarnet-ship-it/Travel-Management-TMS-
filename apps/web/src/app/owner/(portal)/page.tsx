'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarCheck, CarFront, CheckCircle2, Clock, IndianRupee, Percent, Plus, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDate, fmtDateTime, inr } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatusBadge } from '@/components/ui/Display';
import { daysUntil } from '@/components/partner/common';

interface Dashboard {
  stats: {
    vehicles: number;
    activeVehicles: number;
    upcomingTrips: number;
    pendingDecision: number;
    monthTrips: number;
    monthEarnings: number;
    monthCommission: number;
    totalEarnings: number;
    totalCommission: number;
    totalTrips: number;
    unsettled: number;
  };
  nextTrips: {
    id: string;
    bookingNumber: string;
    status: BookingStatus;
    pickupAt: string;
    pickupAddress: string;
    vehicle: { title: string; registrationNumber: string };
    driver: { user: { name: string | null } } | null;
    withDriver: boolean;
  }[];
  docsExpiring: { id: string; title: string; registrationNumber: string; insuranceExpiry: string | null; fitnessExpiry: string | null; pollutionExpiry: string | null; permitExpiry: string | null }[];
}

const EXPIRY_FIELDS = [
  ['insuranceExpiry', 'Insurance'],
  ['fitnessExpiry', 'Fitness'],
  ['pollutionExpiry', 'PUC'],
  ['permitExpiry', 'Permit'],
] as const;

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Dashboard>('/owner/dashboard');

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.owner?.businessName ?? 'Partner'}`}
        subtitle="Here is how your fleet is doing."
        actions={
          <>
            <ButtonLink href="/owner/bookings" variant="outline" icon={<CalendarCheck className="h-4 w-4" />}>
              Bookings
            </ButtonLink>
            <ButtonLink href="/owner/vehicles/new" variant="gold" icon={<Plus className="h-4 w-4" />}>
              Add vehicle
            </ButtonLink>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          {data.stats.pendingDecision > 0 && (
            <Link href="/owner/bookings?tab=pending" className="mb-6 flex items-center gap-3 rounded-2xl bg-navy-900 px-5 py-4 text-white shadow-card transition hover:bg-navy-800">
              <Clock className="h-5 w-5 text-gold-400" />
              <span className="flex-1 font-semibold">
                {data.stats.pendingDecision} booking{data.stats.pendingDecision > 1 ? 's' : ''} waiting for your decision
              </span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Vehicles" value={data.stats.vehicles} hint={`${data.stats.activeVehicles} active`} icon={<CarFront className="h-5 w-5" />} href="/owner/vehicles" />
            <StatCard label="Upcoming trips" value={data.stats.upcomingTrips} icon={<CalendarCheck className="h-5 w-5" />} tone="blue" href="/owner/bookings?tab=upcoming" />
            <StatCard label="Pending decisions" value={data.stats.pendingDecision} icon={<Clock className="h-5 w-5" />} tone={data.stats.pendingDecision ? 'amber' : 'navy'} href="/owner/bookings?tab=pending" />
            <StatCard label="Unsettled balance" value={inr(data.stats.unsettled)} hint="Completed trips awaiting payout" icon={<Wallet className="h-5 w-5" />} tone="gold" href="/owner/earnings" />
            <StatCard label="This month · trips" value={data.stats.monthTrips} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
            <StatCard label="This month · earnings" value={inr(data.stats.monthEarnings)} hint="Your payout after commission" icon={<IndianRupee className="h-5 w-5" />} tone="green" />
            <StatCard label="This month · commission" value={inr(data.stats.monthCommission)} icon={<Percent className="h-5 w-5" />} tone="red" />
            <StatCard label="Total earnings" value={inr(data.stats.totalEarnings)} hint={`${data.stats.totalTrips} trips · ${inr(data.stats.totalCommission)} commission`} icon={<IndianRupee className="h-5 w-5" />} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Next trips"
                action={
                  <Link href="/owner/bookings?tab=upcoming" className="text-sm font-semibold text-navy-600 hover:underline">
                    View all
                  </Link>
                }
              />
              {data.nextTrips.length === 0 ? (
                <EmptyState title="No upcoming trips" description="Confirmed bookings will show up here." icon={<CalendarCheck className="h-6 w-6" />} />
              ) : (
                <ul className="divide-y divide-mist-100">
                  {data.nextTrips.map((t) => (
                    <li key={t.id}>
                      <Link href={`/owner/bookings/${t.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-mist-50 sm:flex-nowrap">
                        <div className="w-28 shrink-0">
                          <p className="text-sm font-semibold text-navy-900">{fmtDate(t.pickupAt)}</p>
                          <p className="text-xs text-slate-500">{fmtDateTime(t.pickupAt).split(', ').pop()}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {t.vehicle.title} <span className="font-mono text-xs text-slate-500">{t.vehicle.registrationNumber}</span>
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            #{t.bookingNumber} · {t.pickupAddress}
                          </p>
                          <p className="text-xs text-slate-500">{t.driver?.user.name ? `Driver: ${t.driver.user.name}` : <span className="font-semibold text-amber-700">No driver assigned</span>}</p>
                        </div>
                        <StatusBadge status={t.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Documents expiring" subtitle="Within the next 30 days" />
                {data.docsExpiring.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> All vehicle documents are up to date.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.docsExpiring.map((v) => (
                      <li key={v.id}>
                        <Link href={`/owner/vehicles/${v.id}?tab=compliance`} className="block rounded-xl border border-amber-200 bg-amber-50/60 p-3 hover:bg-amber-50">
                          <p className="text-sm font-semibold text-navy-900">
                            {v.title} <span className="font-mono text-xs text-slate-500">{v.registrationNumber}</span>
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {EXPIRY_FIELDS.map(([k, label]) => {
                              const d = daysUntil(v[k]);
                              if (d == null || d > 30) return null;
                              return (
                                <li key={k} className={d < 0 ? 'flex items-center gap-1 text-xs font-semibold text-red-600' : 'flex items-center gap-1 text-xs text-amber-800'}>
                                  <AlertTriangle className="h-3 w-3" />
                                  {label} {d < 0 ? `expired on ${fmtDate(v[k])}` : `expires ${fmtDate(v[k])} (${d} day${d === 1 ? '' : 's'})`}
                                </li>
                              );
                            })}
                          </ul>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader title="Quick links" />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { href: '/owner/vehicles/new', label: 'Add vehicle', icon: Plus },
                    { href: '/owner/drivers', label: 'Link a driver', icon: Users },
                    { href: '/owner/earnings', label: 'Payouts', icon: Wallet },
                    { href: '/owner/profile', label: 'KYC & bank', icon: CheckCircle2 },
                  ].map((q) => (
                    <Link key={q.href} href={q.href} className="flex flex-col items-start gap-2 rounded-xl border border-mist-200 p-3 text-sm font-semibold text-navy-900 transition hover:border-gold-400 hover:bg-gold-50/40">
                      <q.icon className="h-5 w-5 text-gold-600" />
                      {q.label}
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
