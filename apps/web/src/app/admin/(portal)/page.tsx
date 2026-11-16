'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  CalendarClock,
  Car,
  CarFront,
  ChevronRight,
  Gem,
  Hourglass,
  IndianRupee,
  RefreshCw,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, inr, PURPOSE_LABEL, titleCase } from '@/lib/format';
import type { BookingStatus, TravelPurpose } from '@/lib/types';
import { ErrorState, PageHeader, Skeleton, StatCard, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Field';
import { DataTable } from '@/components/admin/DataTable';
import { ChartCard, ColumnChart, RankBarChart, TrendChart } from '@/components/admin/Charts';
import { Cell } from '@/components/admin/bits';
import { compactInr, SERIES } from '@/components/admin/utils';

interface Dashboard {
  cards: {
    totalRevenue: number;
    grossCollected: number;
    refunded: number;
    totalBookings: number;
    todaysBookings: number;
    upcomingWeddings: number;
    totalVehicles: number;
    availableVehicles: number;
    maintenance: number;
    customers: number;
    activeDrivers: number;
    pendingPayments: number;
    pendingRequests: number;
    cancelled: number;
  };
  actionItems: { vehicleApprovals: number; ownerKyc: number; driverVerification: number; weddingEnquiries: number; refunds: number; enquiries: number };
  charts: {
    monthlyRevenue: { month: string; revenue: number; bookings: number }[];
    dailyTrend: { day: string; bookings: number; value: number }[];
    categoryPerformance: { category: string; bookings: number; revenue: number }[];
    weddingVsRegular: { month: string; wedding: number; regular: number }[];
    topVehicles: { vehicle: string; bookings: number; revenue: number }[];
    ownerRevenue: { owner: string; revenue: number; payout: number; commission: number }[];
    paymentCollection: { gateway: string; method: string; amount: number; count: number }[];
  };
  recentBookings: {
    id: string;
    bookingNumber: string;
    status: BookingStatus;
    purpose: TravelPurpose;
    totalAmount: number;
    pickupAt: string;
    createdAt: string;
    customer: { name: string | null; phone: string };
    vehicle: { title: string };
  }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y?.slice(2)}`;
};
const dayLabel = (d: string) => {
  const [, mm, dd] = d.split('-');
  return `${Number(dd)} ${MONTHS[Number(mm) - 1] ?? ''}`;
};
const count = (v: number) => v.toLocaleString('en-IN');

/** Fill the last 30 IST days so gaps show as zero rather than being skipped. */
function fillDays(rows: { day: string; bookings: number; value: number }[]) {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; bookings: number; value: number }[] = [];
  const today = Date.now() + 330 * 60_000;
  for (let i = 29; i >= 0; i--) {
    const k = new Date(today - i * 86_400_000).toISOString().slice(0, 10);
    out.push(map.get(k) ?? { day: k, bookings: 0, value: 0 });
  }
  return out;
}

export default function AdminDashboardPage() {
  const { hasPermission, user } = useAuth();
  const [months, setMonths] = useState<'6' | '12' | '24'>('12');
  const allowed = hasPermission('dashboard:read');
  const { data, error, loading, reload } = useApi<Dashboard>(allowed ? '/admin/dashboard' : null, { query: { months } });

  const daily = useMemo(() => fillDays(data?.charts.dailyTrend ?? []), [data]);
  const payments = useMemo(
    () => (data?.charts.paymentCollection ?? []).map((p) => ({ ...p, label: `${titleCase(p.gateway)} · ${p.method === 'other' ? 'Other' : titleCase(p.method)}` })),
    [data],
  );

  if (!allowed) {
    return (
      <div>
        <PageHeader title={`Welcome${user?.name ? `, ${user.name}` : ''}`} subtitle="Use the menu to open the modules you have access to." />
      </div>
    );
  }

  const c = data?.cards;
  const a = data?.actionItems;
  const actions = a
    ? [
        { label: 'Vehicle approvals', n: a.vehicleApprovals, href: '/admin/vehicles?status=PENDING_APPROVAL', show: hasPermission('vehicles:read') },
        { label: 'Owner KYC', n: a.ownerKyc, href: '/admin/owners?kycStatus=PENDING', show: hasPermission('owners:read') },
        { label: 'Driver verification', n: a.driverVerification, href: '/admin/drivers?status=PENDING', show: hasPermission('drivers:read') },
        { label: 'Wedding enquiries', n: a.weddingEnquiries, href: '/admin/weddings?status=ENQUIRY', show: hasPermission('weddings:read') },
        { label: 'Pending refunds', n: a.refunds, href: '/admin/refunds?status=INITIATED', show: hasPermission('refunds:read') },
        { label: 'New enquiries', n: a.enquiries, href: '/admin/enquiries?status=NEW', show: hasPermission('customers:read') },
      ].filter((x) => x.show)
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of bookings, fleet and collections"
        actions={
          <>
            <Segmented value={months} onChange={setMonths} options={[{ value: '6', label: '6M' }, { value: '12', label: '12M' }, { value: '24', label: '24M' }]} />
            <Button variant="outline" size="sm" className="h-10" icon={<RefreshCw className="h-4 w-4" />} onClick={reload} loading={loading && !!data}>
              Refresh
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={reload} />
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {!c
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
          : [
              <StatCard key="rev" label="Total revenue" value={inr(c.totalRevenue)} hint={`${inr(c.grossCollected)} collected · ${inr(c.refunded)} refunded`} icon={<IndianRupee className="h-5 w-5" />} tone="gold" href="/admin/payments" />,
              <StatCard key="tb" label="Total bookings" value={count(c.totalBookings)} icon={<CalendarCheck className="h-5 w-5" />} href="/admin/bookings" />,
              <StatCard key="today" label="Today's bookings" value={count(c.todaysBookings)} icon={<CalendarClock className="h-5 w-5" />} tone="blue" href="/admin/bookings" />,
              <StatCard key="wed" label="Upcoming weddings" value={count(c.upcomingWeddings)} icon={<Gem className="h-5 w-5" />} tone="gold" href="/admin/weddings?upcoming=true" />,
              <StatCard key="veh" label="Total vehicles" value={count(c.totalVehicles)} icon={<Car className="h-5 w-5" />} href="/admin/vehicles" />,
              <StatCard key="avail" label="Available now" value={count(c.availableVehicles)} hint="Active & not on a trip or block" icon={<CarFront className="h-5 w-5" />} tone="green" href="/admin/vehicles?status=ACTIVE" />,
              <StatCard key="mnt" label="Under maintenance" value={count(c.maintenance)} icon={<Wrench className="h-5 w-5" />} tone="amber" href="/admin/vehicles?status=MAINTENANCE" />,
              <StatCard key="cust" label="Customers" value={count(c.customers)} icon={<Users className="h-5 w-5" />} href="/admin/customers" />,
              <StatCard key="drv" label="Active drivers" value={count(c.activeDrivers)} hint="Verified & available" icon={<UserRound className="h-5 w-5" />} tone="green" href="/admin/drivers?status=APPROVED" />,
              <StatCard key="pp" label="Pending payments" value={inr(c.pendingPayments)} hint="Balance due on confirmed trips" icon={<Wallet className="h-5 w-5" />} tone="amber" href="/admin/bookings?status=CONFIRMED,DRIVER_ASSIGNED,VEHICLE_DISPATCHED,TRIP_STARTED" />,
              <StatCard key="pr" label="Pending requests" value={count(c.pendingRequests)} hint="Awaiting payment or owner decision" icon={<Hourglass className="h-5 w-5" />} tone="blue" href="/admin/bookings?status=AWAITING_PAYMENT" />,
              <StatCard key="cx" label="Cancelled" value={count(c.cancelled)} icon={<Ban className="h-5 w-5" />} tone="red" href="/admin/bookings?status=CANCELLED,REFUND_INITIATED,REFUNDED" />,
            ]}
      </div>

      {/* Action items */}
      {actions.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gold-200 bg-gradient-to-r from-gold-50 to-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
            <AlertTriangle className="h-4 w-4 text-gold-600" /> Needs attention
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {actions.map((x) => (
              <Link
                key={x.label}
                href={x.href}
                className="group flex items-center justify-between gap-2 rounded-xl border border-mist-200 bg-white px-3 py-2.5 transition hover:border-gold-300 hover:shadow-card"
              >
                <span className="min-w-0">
                  <span className="block text-xl font-bold tabular-nums text-navy-900">{x.n}</span>
                  <span className="block truncate text-xs text-slate-500">{x.label}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-gold-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {data && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Monthly revenue" subtitle={`Captured payments, last ${months} months`} empty={!data.charts.monthlyRevenue.length}>
            <ColumnChart data={data.charts.monthlyRevenue} x="month" xFmt={monthLabel} series={[{ key: 'revenue', label: 'Revenue' }]} fmt={compactInr} />
          </ChartCard>
          <ChartCard title="Daily booking trend" subtitle="Bookings created per day, last 30 days">
            <TrendChart data={daily} x="day" y="bookings" label="Bookings" xFmt={dayLabel} fmt={count} />
          </ChartCard>
          <ChartCard title="Vehicle category performance" subtitle="Confirmed booking value by category" empty={!data.charts.categoryPerformance.length}>
            <RankBarChart data={data.charts.categoryPerformance} y="category" series={[{ key: 'revenue', label: 'Revenue' }]} fmt={compactInr} />
          </ChartCard>
          <ChartCard title="Wedding vs regular bookings" subtitle="Non-cancelled bookings per month" empty={!data.charts.weddingVsRegular.length}>
            <ColumnChart
              data={data.charts.weddingVsRegular}
              x="month"
              xFmt={monthLabel}
              stacked
              series={[
                { key: 'regular', label: 'Regular', color: SERIES[0] },
                { key: 'wedding', label: 'Wedding', color: SERIES[1] },
              ]}
              fmt={count}
            />
          </ChartCard>
          <ChartCard title="Most booked vehicles" subtitle="Confirmed bookings, top 8" empty={!data.charts.topVehicles.length}>
            <RankBarChart data={data.charts.topVehicles} y="vehicle" series={[{ key: 'bookings', label: 'Bookings' }]} fmt={count} labelWidth={140} />
          </ChartCard>
          <ChartCard title="Owner-wise revenue" subtitle="Owner payout and platform commission, top 8" empty={!data.charts.ownerRevenue.length}>
            <RankBarChart
              data={data.charts.ownerRevenue}
              y="owner"
              stacked
              series={[
                { key: 'payout', label: 'Owner payout', color: SERIES[0] },
                { key: 'commission', label: 'Commission', color: SERIES[1] },
              ]}
              fmt={compactInr}
              labelWidth={140}
            />
          </ChartCard>
          <ChartCard title="Payment collection" subtitle={`Captured amount by gateway and method, last ${months} months`} empty={!payments.length}>
            <RankBarChart data={payments} y="label" series={[{ key: 'amount', label: 'Collected' }]} fmt={compactInr} labelWidth={150} />
          </ChartCard>
          <ChartCard title="Recent bookings" action={<Link href="/admin/bookings" className="text-xs font-semibold text-navy-600 hover:underline">View all</Link>}>
            <div className="-mx-5 -mb-5">
              <DataTable
                className="[&_.card]:rounded-none [&_.card]:border-0 [&_.card]:shadow-none"
                rows={data.recentBookings}
                rowKey={(b) => b.id}
                rowHref={(b) => `/admin/bookings/${b.id}`}
                empty="No bookings yet"
                columns={[
                  { key: 'no', header: 'Booking', render: (b) => <Cell primary={b.bookingNumber} secondary={PURPOSE_LABEL[b.purpose]} /> },
                  { key: 'cust', header: 'Customer', render: (b) => <Cell primary={b.customer.name ?? '—'} secondary={b.vehicle.title} /> },
                  { key: 'pick', header: 'Pickup', render: (b) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(b.pickupAt)}</span> },
                  { key: 'amt', header: 'Amount', align: 'right', render: (b) => <span className="tabular-nums">{inr(Number(b.totalAmount))}</span> },
                  { key: 'st', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
                ]}
              />
            </div>
          </ChartCard>
        </div>
      )}
      {!data && loading && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      )}
    </div>
  );
}
