'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Mail, Phone, Send, Star, Truck, UserPlus, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, inr, PURPOSE_LABEL, titleCase, TRIP_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, DL, EmptyState, ErrorState, Modal, PageHeader, Skeleton, StatusBadge } from '@/components/ui/Display';
import { Field, Textarea } from '@/components/ui/Field';
import { VehicleImage } from '@/components/ui/CarArt';
import { Banner, MoneyRow, RouteList, StatusTimeline } from '@/components/partner/common';
import type { BookingDetail, FleetDriver } from '@/components/partner/types';

const CLOSED = ['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'];
const ASSIGN_TONE = { ASSIGNED: 'amber', ACCEPTED: 'green', REJECTED: 'red', CANCELLED: 'gray', COMPLETED: 'blue' } as const;
const ASSIGN_LABEL = { ASSIGNED: 'Awaiting driver response', ACCEPTED: 'Accepted', REJECTED: 'Declined', CANCELLED: 'Replaced', COMPLETED: 'Completed' } as const;

export default function OwnerBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, loading, reload } = useApi<BookingDetail>(`/owner/bookings/${id}`);
  const [decision, setDecision] = useState<'accept' | 'reject' | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  if (error && !b) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !b) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!b) return null;

  const closed = CLOSED.includes(b.status);
  const needsDecision = b.ownerDecision === 'PENDING' && !closed;
  const canAssign = b.withDriver && ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(b.status) && b.ownerDecision !== 'REJECTED';
  const canDispatch = ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(b.status) && b.ownerDecision === 'ACCEPTED';
  const currentAssignment = b.assignments.find((a) => a.status === 'ASSIGNED' || a.status === 'ACCEPTED');
  const quote = b.priceBreakdown;
  const bill = b.extraCharges;
  const taxable = bill?.taxable ?? quote?.taxable ?? b.subtotal;
  const passThrough = bill?.passThrough ?? quote?.passThrough ?? 0;
  const total = b.finalAmount ?? b.totalAmount;
  const balance = Math.max(0, total - b.paidAmount);

  async function dispatch() {
    if (b!.withDriver && !b!.driver && !confirm('No driver is assigned yet. Dispatch anyway?')) return;
    setDispatching(true);
    try {
      await api(`/owner/bookings/${id}/dispatch`, { method: 'POST' });
      toast.success('Vehicle marked as dispatched — the customer has been notified');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div>
      <PageHeader
        back={
          <Link href="/owner/bookings" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900">
            <ArrowLeft className="h-4 w-4" /> Bookings
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            Booking #{b.bookingNumber} <StatusBadge status={b.status} />
          </span>
        }
        subtitle={`${PURPOSE_LABEL[b.purpose]} · ${TRIP_LABEL[b.tripType]} · ${b.withDriver ? 'With driver' : 'Self drive'}`}
      />

      {needsDecision && (
        <div className="mb-6 rounded-2xl border border-gold-300 bg-gold-50 p-5">
          <p className="font-semibold text-navy-900">This booking needs your decision</p>
          <p className="mt-1 text-sm text-slate-600">
            Accept to commit your vehicle for this trip. Rejecting cancels the booking and the customer gets a full refund.
            {b.status === 'AWAITING_PAYMENT' && ' The customer has not completed the advance payment yet.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDecision('accept')}>
              Accept booking
            </Button>
            <Button variant="outline" size="lg" className="text-red-600" icon={<XCircle className="h-4 w-4" />} onClick={() => setDecision('reject')}>
              Reject
            </Button>
          </div>
        </div>
      )}
      {b.ownerDecision === 'ACCEPTED' && b.ownerNote && <Banner tone="green" title="You accepted this booking">Note: {b.ownerNote}</Banner>}
      {b.status === 'CANCELLED' && <Banner tone="red" title="Booking cancelled">{b.cancellationReason ?? 'This booking was cancelled.'}</Banner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(canAssign || canDispatch) && (
            <Card>
              <CardHeader title="Trip operations" subtitle="Assign a driver, then dispatch the vehicle to the pickup point." />
              <div className="flex flex-wrap items-center gap-4">
                {b.withDriver && (
                  <div className="min-w-0 flex-1">
                    {b.driver ? (
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{b.driver.user.name ?? 'Driver'}</p>
                        <p className="text-xs text-slate-500">
                          <a href={`tel:${b.driver.user.phone}`} className="underline">
                            {b.driver.user.phone}
                          </a>{' '}
                          · Licence {b.driver.licenceNumber}
                        </p>
                        {currentAssignment && (
                          <Badge tone={ASSIGN_TONE[currentAssignment.status]} className="mt-1">
                            {ASSIGN_LABEL[currentAssignment.status]}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-amber-700">No driver assigned yet</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canAssign && (
                    <Button variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)} disabled={b.ownerDecision === 'PENDING'}>
                      {b.driver ? 'Change driver' : 'Assign driver'}
                    </Button>
                  )}
                  {canDispatch && (
                    <Button variant="gold" icon={<Truck className="h-4 w-4" />} loading={dispatching} onClick={dispatch}>
                      Dispatch vehicle
                    </Button>
                  )}
                </div>
              </div>
              {b.ownerDecision === 'PENDING' && canAssign && <p className="mt-3 text-xs text-slate-500">Accept the booking first to assign a driver.</p>}
            </Card>
          )}

          <Card>
            <CardHeader title="Trip details" />
            <DL
              items={[
                ['Pickup', fmtDateTime(b.pickupAt)],
                ['Return', fmtDateTime(b.returnAt)],
                ['Passengers', `${b.passengers} · ${b.luggageBags} bags`],
                ['Estimated distance', b.estimatedKm ? `${b.estimatedKm} km` : '—'],
                ['AC', b.acRequired ? 'Required' : 'Not required'],
                ['Decoration', b.decorationRequired ? 'Yes — wedding decoration' : 'No'],
                ...(b.startOdometer != null ? ([['Odometer', `${b.startOdometer} → ${b.endOdometer ?? '…'} km`]] as [string, string][]) : []),
              ]}
            />
            <div className="mt-5 border-t border-mist-100 pt-5">
              <RouteList pickupAddress={b.pickupAddress} dropAddress={b.dropAddress} locations={b.locations} />
            </div>
            {b.specialRequests && (
              <div className="mt-5 rounded-xl bg-gold-50 px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Special requests</p>
                <p className="mt-1 whitespace-pre-line text-slate-800">{b.specialRequests}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Fare & your earnings" subtitle={bill ? 'Final bill after trip completion' : 'As quoted at booking — final bill is computed when the trip ends'} />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer fare</p>
                {quote?.lines?.map((l) => <MoneyRow key={l.code + l.label} label={l.label} value={inr(l.amount)} muted={!l.taxable} />)}
                {bill && (
                  <>
                    {bill.extraKmCharge > 0 && <MoneyRow label={`Extra ${bill.extraKm} km`} value={inr(bill.extraKmCharge)} />}
                    {bill.extraHourCharge > 0 && <MoneyRow label={`Extra ${bill.extraHours} hr`} value={inr(bill.extraHourCharge)} />}
                    {bill.tolls > 0 && <MoneyRow label="Tolls (actual)" value={inr(bill.tolls)} muted />}
                    {bill.parking > 0 && <MoneyRow label="Parking (actual)" value={inr(bill.parking)} muted />}
                  </>
                )}
                {b.discountAmount > 0 && <MoneyRow label="Discount" value={`− ${inr(b.discountAmount)}`} negative />}
                <MoneyRow label={`GST${quote?.gstPercent ? ` (${quote.gstPercent}%)` : ''}`} value={inr(bill?.gst ?? b.taxAmount)} />
                <MoneyRow label="Total" value={inr(total)} strong />
                <MoneyRow label="Paid by customer" value={inr(b.paidAmount)} muted />
                {balance > 0 && <MoneyRow label="Balance due" value={inr(balance)} muted />}
              </div>
              <div className="rounded-2xl bg-navy-900 p-5 text-white">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-300">Your earnings</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-100">Taxable trip fare</span>
                    <span className="tabular-nums">{inr(taxable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-100">Commission ({b.commissionRate ?? 0}%)</span>
                    <span className="tabular-nums text-red-300">− {inr(b.commissionAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-100">Tolls, parking & taxes (pass-through)</span>
                    <span className="tabular-nums">+ {inr(passThrough)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/15 pt-3 text-base font-bold">
                    <span>Your payout</span>
                    <span className="tabular-nums text-gold-300">{inr(b.ownerPayout)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-navy-200">GST is collected from the customer and is not deducted from your payout.</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status timeline" />
            <StatusTimeline history={b.statusHistory} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <p className="font-semibold text-navy-900">{b.customer.name ?? 'Customer'}</p>
            <div className="mt-3 flex flex-col gap-2">
              <a href={`tel:${b.customer.phone}`} className="inline-flex items-center gap-2 rounded-xl border border-mist-200 px-3 py-2.5 text-sm font-semibold text-navy-800 hover:bg-mist-50">
                <Phone className="h-4 w-4 text-gold-600" /> {b.customer.phone}
              </a>
              {b.customer.email && (
                <a href={`mailto:${b.customer.email}`} className="inline-flex items-center gap-2 truncate rounded-xl border border-mist-200 px-3 py-2.5 text-sm font-medium text-navy-800 hover:bg-mist-50">
                  <Mail className="h-4 w-4 text-gold-600" /> {b.customer.email}
                </a>
              )}
            </div>
          </Card>
          <Card padded={false} className="overflow-hidden">
            <VehicleImage src={b.vehicle.images?.[0]?.url} alt={b.vehicle.title} categorySlug={b.vehicle.category?.slug} seats={b.vehicle.seats} className="aspect-[16/9] w-full" />
            <div className="p-5">
              <Link href={`/owner/vehicles/${b.vehicle.id}`} className="font-semibold text-navy-900 hover:underline">
                {b.vehicle.title}
              </Link>
              <p className="font-mono text-xs text-slate-500">{b.vehicle.registrationNumber}</p>
            </div>
          </Card>
          {b.assignments.length > 0 && (
            <Card>
              <CardHeader title="Driver assignments" />
              <ul className="space-y-3">
                {b.assignments.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-navy-900">{a.driver?.user.name ?? a.driver?.user.phone ?? 'Driver'}</span>
                      <Badge tone={ASSIGN_TONE[a.status]}>{ASSIGN_LABEL[a.status]}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {fmtDateTime(a.assignedAt)}
                      {a.note && ` · ${a.note}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {b.payments && b.payments.length > 0 && (
            <Card>
              <CardHeader title="Payments" />
              <ul className="space-y-2 text-sm">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{titleCase(p.purpose)}</span>
                      <span className="block text-xs text-slate-500">
                        {fmtDateTime(p.createdAt)} · {p.method ?? titleCase(p.gateway)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-semibold">{inr(p.amount)}</span>
                      <span className="block text-xs text-slate-500">{titleCase(p.status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <DecisionModal mode={decision} onClose={() => setDecision(null)} bookingId={b.id} onDone={reload} />
      {assignOpen && <AssignModal bookingId={b.id} currentDriverId={b.driver?.id} onClose={() => setAssignOpen(false)} onDone={reload} />}
    </div>
  );
}

function DecisionModal({ mode, onClose, bookingId, onDone }: { mode: 'accept' | 'reject' | null; onClose: () => void; bookingId: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (mode === 'reject' && note.trim().length < 3) return toast.error('Please tell the customer why you are rejecting');
    setBusy(true);
    try {
      await api(`/owner/bookings/${bookingId}/decision`, { body: { accept: mode === 'accept', note: note.trim() || undefined } });
      toast.success(mode === 'accept' ? 'Booking accepted' : 'Booking rejected — the customer will be refunded');
      setNote('');
      onClose();
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === 'accept' ? 'Accept booking' : 'Reject booking'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'accept' ? 'primary' : 'danger'} loading={busy} onClick={submit}>
            {mode === 'accept' ? 'Accept' : 'Reject booking'}
          </Button>
        </>
      }
    >
      {mode === 'reject' && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">The booking will be cancelled and the customer fully refunded. Frequent rejections may affect your listing ranking.</p>}
      <Field label={mode === 'accept' ? 'Note (optional)' : 'Reason'} required={mode === 'reject'}>
        <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'accept' ? 'e.g. Driver will call 1 hour before pickup' : 'e.g. Vehicle under unexpected repair'} rows={3} />
      </Field>
    </Modal>
  );
}

function AssignModal({ bookingId, currentDriverId, onClose, onDone }: { bookingId: string; currentDriverId?: string; onClose: () => void; onDone: () => void }) {
  const { data, error, loading, reload } = useApi<FleetDriver[]>(`/owner/bookings/${bookingId}/available-drivers`);
  const [busy, setBusy] = useState<string | null>(null);
  async function assign(driverId: string) {
    setBusy(driverId);
    try {
      await api(`/owner/bookings/${bookingId}/assign-driver`, { body: { driverId } });
      toast.success('Driver assigned — they have been notified');
      onClose();
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open onClose={onClose} title="Assign a driver" size="lg">
      <p className="mb-4 text-sm text-slate-500">Verified drivers from your fleet and the Royal Ride driver pool who are free for this trip window.</p>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState title="No drivers available" description="Link verified drivers to your fleet under Fleet drivers, or try again later." />
      ) : (
        <ul className="divide-y divide-mist-100">
          {data?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 font-bold text-navy-700">{(d.user.name ?? '?').slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900">
                  {d.user.name ?? 'Driver'} {d.id === currentDriverId && <Badge tone="blue">Current</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  {d.user.phone} · {d.experienceYears} yrs exp
                  {d.languages?.length ? ` · ${d.languages.join(', ')}` : ''}
                  {Number(d.ratingAvg) > 0 && (
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      · <Star className="h-3 w-3 fill-gold-500 text-gold-500" /> {Number(d.ratingAvg).toFixed(1)}
                    </span>
                  )}
                </p>
              </div>
              <Button size="sm" variant={d.id === currentDriverId ? 'outline' : 'primary'} loading={busy === d.id} disabled={!!busy || d.id === currentDriverId} onClick={() => assign(d.id)} icon={<Send className="h-3.5 w-3.5" />}>
                Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
