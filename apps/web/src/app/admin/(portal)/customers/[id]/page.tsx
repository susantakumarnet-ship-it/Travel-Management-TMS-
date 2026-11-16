'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Ban, CheckCircle2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { BookingStatus } from '@/lib/types';
import { fmtDate, fmtDateTime, inr } from '@/lib/format';
import { DL, ErrorState, PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { BackLink, EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { usePerm } from '@/components/admin/hooks';
import { USER_STATUS_TONE, WEDDING_STATUS_TONE, reportError } from '@/components/admin/utils';

interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  customerProfile: { gstin: string | null; companyName: string | null; gender: string | null; dateOfBirth: string | null; emergencyName: string | null; emergencyPhone: string | null } | null;
  addresses: { id: string; label: string; line1: string; line2: string | null; city: string; state: string; pincode: string; isDefault: boolean }[];
  bookings: { id: string; bookingNumber: string; status: BookingStatus; pickupAt: string; totalAmount: number; paidAmount: number; vehicle: { title: string } }[];
  weddingRequests: { id: string; requestNumber: string; weddingDate: string; status: string }[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string }[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canWrite } = usePerm('customers');
  const { data: c, loading, error, reload } = useApi<CustomerDetail>(`/admin/customers/${id}`);
  const [confirm, setConfirm] = useState(false);

  if (loading && !c) return <PageSkeleton />;
  if (error || !c) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;

  const suspended = c.status === 'SUSPENDED';
  const totalPaid = c.bookings.reduce((a, b) => a + Number(b.paidAmount), 0);
  const addr = (a: CustomerDetail['addresses'][number]) => [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');

  async function toggle() {
    try {
      await api(`/admin/customers/${id}/status`, { method: 'PATCH', body: { status: suspended ? 'ACTIVE' : 'SUSPENDED' } });
      toast.success(suspended ? 'Customer re-activated' : 'Customer suspended and signed out');
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  return (
    <>
      <PageHeader
        back={<BackLink href="/admin/customers" label="Customers" />}
        title={c.name || 'Unnamed customer'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {c.phone} {c.email && `· ${c.email}`} <EnumBadge value={c.status} tones={USER_STATUS_TONE} />
          </span>
        }
        actions={
          canWrite && (
            <Button variant={suspended ? 'primary' : 'danger'} icon={suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              {suspended ? 'Activate' : 'Suspend'}
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Bookings" value={c.bookings.length} />
        <StatCard label="Total paid" value={inr(totalPaid)} tone="gold" />
        <StatCard label="Wedding requests" value={c.weddingRequests.length} tone="blue" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Section title="Profile">
            <DL
              cols={1}
              items={[
                ['Joined', fmtDate(c.createdAt)],
                ['Last login', fmtDateTime(c.lastLoginAt)],
                ['Company', c.customerProfile?.companyName],
                ['GSTIN', c.customerProfile?.gstin],
                ['Gender', c.customerProfile?.gender],
                ['Date of birth', c.customerProfile?.dateOfBirth ? fmtDate(c.customerProfile.dateOfBirth) : null],
                ['Emergency contact', c.customerProfile?.emergencyName ? `${c.customerProfile.emergencyName} (${c.customerProfile.emergencyPhone ?? '—'})` : null],
              ]}
            />
          </Section>
          <Section title="Saved addresses">
            {c.addresses.length ? (
              <ul className="space-y-2 text-sm">
                {c.addresses.map((a) => (
                  <li key={a.id} className="rounded-lg border border-mist-200 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">{a.label}{a.isDefault && ' · default'}</p>
                    <p className="text-slate-700">{addr(a)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No saved addresses.</p>
            )}
          </Section>
          <Section title="Reviews">
            {c.reviews.length ? (
              <ul className="space-y-3">
                {c.reviews.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-navy-900">
                      <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" /> {r.rating}/5
                    </span>
                    <span className="ml-2 text-xs text-slate-500">{fmtDate(r.createdAt)}</span>
                    {r.comment && <p className="mt-0.5 text-slate-600">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No reviews yet.</p>
            )}
          </Section>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Bookings</h3>
            <DataTable
              rows={c.bookings}
              rowKey={(b) => b.id}
              rowHref={(b) => `/admin/bookings/${b.id}`}
              empty="No bookings yet"
              columns={[
                { key: 'no', header: 'Booking', render: (b) => <Link href={`/admin/bookings/${b.id}`} className="font-semibold text-navy-900 hover:underline">{b.bookingNumber}</Link> },
                { key: 'veh', header: 'Vehicle', render: (b) => b.vehicle.title },
                { key: 'pick', header: 'Pickup', render: (b) => fmtDateTime(b.pickupAt) },
                { key: 'st', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
                { key: 'tot', header: 'Total', align: 'right', render: (b) => inr(Number(b.totalAmount)) },
                { key: 'paid', header: 'Paid', align: 'right', render: (b) => inr(Number(b.paidAmount)) },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold text-navy-900">Wedding requests</h3>
            <DataTable
              rows={c.weddingRequests}
              rowKey={(w) => w.id}
              rowHref={(w) => `/admin/weddings/${w.id}`}
              empty="No wedding requests"
              columns={[
                { key: 'no', header: 'Request', render: (w) => <Link href={`/admin/weddings/${w.id}`} className="font-semibold text-navy-900 hover:underline">{w.requestNumber}</Link> },
                { key: 'date', header: 'Wedding date', render: (w) => fmtDate(w.weddingDate) },
                { key: 'st', header: 'Status', render: (w) => <EnumBadge value={w.status} tones={WEDDING_STATUS_TONE} /> },
              ]}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={suspended ? 'Activate customer' : 'Suspend customer'}
        message={suspended ? 'The customer will be able to sign in and book again.' : 'The customer will be signed out of all devices and blocked from signing in. Existing bookings are not cancelled.'}
        confirmLabel={suspended ? 'Activate' : 'Suspend'}
        tone={suspended ? 'primary' : 'danger'}
        onConfirm={toggle}
      />
    </>
  );
}
