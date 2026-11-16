'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, CalendarDays, CheckCircle2, Clock, Download, FileText, MapPin, Phone, Star, UserRound, Users, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, downloadFile, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, inr, PURPOSE_LABEL, titleCase, TRIP_LABEL } from '@/lib/format';
import type { BookingStatus, Checkout } from '@/lib/types';
import { Badge, Card, CardHeader, DL, ErrorState, Modal, Skeleton, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { VehicleImage } from '@/components/ui/CarArt';
import { BookingTimeline } from './BookingTimeline';
import { PriceBreakdown } from './PriceBreakdown';
import { usePayment } from './TestCheckout';
import { Countdown, StarInput, Stars } from './bits';
import type { BookingDetail } from './siteTypes';

const CANCELLABLE: BookingStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED'];
const BALANCE_OK: BookingStatus[] = ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'TRIP_COMPLETED'];

export function BookingDetailView({ id, paid }: { id: string; paid: boolean }) {
  const router = useRouter();
  const { data: b, error, loading, reload } = useApi<BookingDetail>(`/customer/bookings/${id}`);
  const { pay, modal } = usePayment();
  const [paying, setPaying] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(paid);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);

  async function startPayment(purpose: 'ADVANCE' | 'FULL' | 'BALANCE') {
    if (!b) return;
    setPaying(purpose);
    try {
      const checkout = await api<Checkout>(`/customer/bookings/${b.id}/payments`, { body: { purpose } });
      const r = await pay(checkout);
      if (r.status === 'success') {
        toast.success('Payment successful');
        setShowPaid(true);
        router.replace(`/account/bookings/${b.id}?paid=1`, { scroll: false });
        await reload();
      } else if (r.status === 'cancelled') toast.message('Payment cancelled');
      else toast.error(r.message);
    } catch (e) {
      toast.error(errorMessage(e));
      void reload();
    } finally {
      setPaying(null);
    }
  }

  if (loading && !b) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[600px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (error || !b) return <ErrorState message={error ?? 'Booking not found'} onRetry={reload} />;

  // Final bill (after the trip) supersedes the quote; cancelled bookings owe nothing.
  const closed = ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'].includes(b.status);
  const billTotal = b.finalAmount ?? b.totalAmount;
  const balance = closed ? 0 : Math.max(0, Math.round((billTotal - b.paidAmount) * 100) / 100);
  const refunded = Math.round(b.refunds.filter((r) => r.status !== 'FAILED').reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const awaiting = b.status === 'AWAITING_PAYMENT';
  const holdLive = awaiting && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() > Date.now() && !holdExpired;
  const driverPhone = b.driver?.user.phone;
  const pickup = b.locations.find((l) => l.type === 'PICKUP');
  const stops = b.locations.filter((l) => l.type === 'STOP');
  const drop = b.locations.find((l) => l.type === 'DROP');

  return (
    <div>
      {modal}
      <Link href="/account/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> All bookings
      </Link>

      {showPaid && !closed && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 animate-fade-up" role="status">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-semibold">Payment received — thank you!</p>
            <p className="text-sm">Your booking {b.bookingNumber} is {b.status === 'AWAITING_PAYMENT' ? 'being confirmed' : 'confirmed'}. We&apos;ve sent the details by SMS{b.invoices.length ? ' and your receipt is ready below' : ''}.</p>
          </div>
          <button onClick={() => setShowPaid(false)} className="rounded p-1 hover:bg-emerald-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-slate-500">{b.bookingNumber}</p>
          <h1 className="text-2xl font-bold">{b.vehicle.title}</h1>
          <p className="text-sm text-slate-500">Booked on {fmtDateTime(b.createdAt)}</p>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {awaiting && (
        <div className={`mt-5 rounded-2xl border p-5 ${holdLive ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          {holdLive ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-amber-900">
                <Clock className="h-5 w-5" /> Complete payment within <Countdown to={b.holdExpiresAt!} onExpire={() => setHoldExpired(true)} className="rounded bg-white px-2 py-0.5 text-amber-900" />
              </p>
              <p className="mt-1 text-sm text-amber-800">We&apos;re holding this vehicle for you. If payment isn&apos;t completed in time, the hold is released automatically.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="gold" onClick={() => startPayment('ADVANCE')} loading={paying === 'ADVANCE'} disabled={!!paying}>
                  Pay advance {inr(b.advanceAmount)}
                </Button>
                <Button variant="outline" onClick={() => startPayment('FULL')} loading={paying === 'FULL'} disabled={!!paying}>
                  Pay full {inr(b.totalAmount)}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="h-5 w-5" /> Reservation hold expired</p>
              <p className="mt-1 text-sm text-red-700">The payment window has closed. Please book again — availability may have changed.</p>
              <Link href={`/vehicles/${b.vehicle.slug}`} className="mt-3 inline-flex rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white">Book again</Link>
            </>
          )}
        </div>
      )}

      {BALANCE_OK.includes(b.status) && balance > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-5">
          <div>
            <p className="font-semibold text-gold-900">Balance due: {inr(balance)}</p>
            <p className="text-sm text-gold-800">Pay online now or to the driver on the trip day.</p>
          </div>
          <Button variant="gold" icon={<Wallet className="h-4 w-4" />} onClick={() => startPayment('BALANCE')} loading={paying === 'BALANCE'} disabled={!!paying}>
            Pay balance {inr(balance)}
          </Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Trip details" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                <div className="text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup</p>
                  <p className="font-semibold text-navy-900">{fmtDateTime(b.pickupAt)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                <div className="text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Return</p>
                  <p className="font-semibold text-navy-900">{fmtDateTime(b.returnAt)}</p>
                </div>
              </div>
            </div>
            <ol className="mt-5 space-y-3 border-l-2 border-dashed border-mist-300 pl-5 text-sm">
              <li className="relative">
                <MapPin className="absolute -left-[30px] h-5 w-5 rounded-full bg-white text-emerald-600" />
                <span className="text-xs font-semibold uppercase text-slate-500">Pickup</span>
                <p className="text-navy-900">{pickup?.address ?? b.pickupAddress}</p>
              </li>
              {stops.map((s, i) => (
                <li key={s.id} className="relative">
                  <MapPin className="absolute -left-[30px] h-5 w-5 rounded-full bg-white text-slate-400" />
                  <span className="text-xs font-semibold uppercase text-slate-500">Stop {i + 1}</span>
                  <p className="text-navy-900">{s.address}</p>
                </li>
              ))}
              <li className="relative">
                <MapPin className="absolute -left-[30px] h-5 w-5 rounded-full bg-white text-red-500" />
                <span className="text-xs font-semibold uppercase text-slate-500">Drop</span>
                <p className="text-navy-900">{drop?.address ?? b.dropAddress ?? 'Same as pickup'}</p>
              </li>
            </ol>
            <div className="mt-5 border-t border-mist-100 pt-5">
              <DL
                cols={3}
                items={[
                  ['Purpose', PURPOSE_LABEL[b.purpose]],
                  ['Fare type', TRIP_LABEL[b.tripType]],
                  ['Passengers', `${b.passengers} · ${b.luggageBags} bags`],
                  ['Driver', b.withDriver ? 'With driver' : 'Self drive'],
                  ['AC', b.acRequired ? 'Yes' : 'No'],
                  ['Est. distance', b.estimatedKm ? `${b.estimatedKm} km` : '—'],
                  ...(b.decorationRequired ? ([['Decoration', 'Wedding decoration']] as [string, string][]) : []),
                ]}
              />
              {b.specialRequests && (
                <p className="mt-4 rounded-xl bg-mist-50 p-3 text-sm text-slate-700">
                  <span className="font-semibold text-navy-900">Special requests: </span>
                  {b.specialRequests}
                </p>
              )}
              {b.passengersList.length > 0 && (
                <div className="mt-4">
                  <p className="label flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Passengers</p>
                  <ul className="flex flex-wrap gap-2 text-sm">
                    {b.passengersList.map((p) => (
                      <li key={p.id} className="rounded-full bg-mist-100 px-3 py-1">{p.name}{p.phone ? ` · ${p.phone}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Vehicle & driver" />
            <div className="flex flex-col gap-5 sm:flex-row">
              <VehicleImage src={b.vehicle.images[0]?.url} alt={b.vehicle.title} categorySlug={b.vehicle.category.slug} seats={b.vehicle.seats} className="aspect-[16/10] w-full rounded-xl sm:w-56" />
              <div className="flex-1 space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-navy-900">{b.vehicle.title}</p>
                  <p className="text-slate-500">
                    {b.vehicle.model.make} {b.vehicle.model.name} · {b.vehicle.seats} seats · {b.vehicle.hasAc ? 'AC' : 'Non-AC'} · {titleCase(b.vehicle.fuelType)}
                  </p>
                  <p className="text-slate-500">Operated by {b.owner.businessName}</p>
                </div>
                {b.driver ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-mist-50 p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 font-semibold text-gold-300">{(b.driver.user.name ?? 'D').charAt(0)}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-navy-900">{b.driver.user.name ?? 'Your driver'}</p>
                      {b.driver.ratingAvg > 0 && <p className="flex items-center gap-1 text-xs text-slate-500"><Star className="h-3 w-3 fill-gold-400 text-gold-400" /> {b.driver.ratingAvg.toFixed(1)}</p>}
                    </div>
                    {driverPhone && !['TRIP_COMPLETED', 'CANCELLED', 'REFUNDED', 'REFUND_INITIATED'].includes(b.status) && (
                      <a href={`tel:+91${driverPhone}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                        <Phone className="h-4 w-4" /> Call driver
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl bg-mist-50 p-3 text-slate-500">
                    <UserRound className="h-4 w-4" /> Driver details will appear here once assigned{b.withDriver ? '' : ' (self-drive booking)'}.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Price breakdown" />
            {b.priceBreakdown?.lines ? <PriceBreakdown quote={b.priceBreakdown} showAdvance={false} /> : <p className="text-sm">Total {inr(b.totalAmount)}</p>}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-mist-50 p-3 text-center text-sm">
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="font-bold text-navy-900">{inr(b.finalAmount ?? b.totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Paid</p>
                <p className="font-bold text-emerald-700">{inr(b.paidAmount)}</p>
              </div>
              {closed ? (
                <div>
                  <p className="text-xs text-slate-500">Refunded</p>
                  <p className="font-bold text-sky-700">{inr(refunded)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-500">Balance</p>
                  <p className="font-bold text-amber-700">{inr(balance)}</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payments & invoices" />
            {b.payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-mist-100 text-sm">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="font-medium text-navy-900">{titleCase(p.purpose)} payment · {inr(p.amount)}</p>
                      <p className="text-xs text-slate-500">{fmtDateTime(p.capturedAt ?? p.createdAt)} · {p.gateway}{p.method ? ` · ${p.method}` : ''}</p>
                      {p.failureReason && p.status === 'FAILED' && <p className="text-xs text-red-600">{p.failureReason}</p>}
                    </div>
                    <Badge tone={p.status === 'CAPTURED' ? 'green' : p.status === 'FAILED' ? 'red' : 'amber'}>{p.status === 'CAPTURED' ? 'Paid' : titleCase(p.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {b.refunds.length > 0 && (
              <div className="mt-4 border-t border-mist-100 pt-4">
                <p className="label">Refunds</p>
                <ul className="space-y-1.5 text-sm">
                  {b.refunds.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>{inr(r.amount)} · {fmtDateTime(r.createdAt)}</span>
                      <Badge tone={r.status === 'PROCESSED' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'}>{titleCase(r.status)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {b.invoices.length > 0 && (
              <div className="mt-4 border-t border-mist-100 pt-4">
                <p className="label">Invoices & receipts</p>
                <ul className="space-y-2">
                  {b.invoices.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-navy-500" />
                        <span>
                          <span className="font-medium text-navy-900">{inv.invoiceNumber}</span>
                          <span className="block text-xs text-slate-500">{titleCase(inv.type)} · {inr(inv.total)}</span>
                        </span>
                      </span>
                      <InvoiceButton id={inv.id} name={`${inv.invoiceNumber.replace(/\//g, '-')}.pdf`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {b.status === 'TRIP_COMPLETED' && (b.review ? <ReviewDisplay review={b.review} /> : <ReviewForm bookingId={b.id} hasDriver={!!b.driver} onDone={reload} />)}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Booking status" />
            <BookingTimeline status={b.status} history={b.statusHistory} createdAt={b.createdAt} paidAmount={b.paidAmount} />
          </Card>
          {CANCELLABLE.includes(b.status) && (
            <Button variant="outline" className="w-full !border-red-200 !text-red-600 hover:!bg-red-50" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )}
          {b.status === 'CANCELLED' && b.cancellationReason && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <span className="font-semibold">Cancellation reason:</span> {b.cancellationReason}
              {b.cancellationFee != null && b.cancellationFee > 0 && <span className="block text-xs">Cancellation fee: {inr(b.cancellationFee)}</span>}
            </p>
          )}
        </aside>
      </div>

      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} booking={b} onDone={reload} />
    </div>
  );
}

function InvoiceButton({ id, name }: { id: string; name: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={loading}
      icon={<Download className="h-4 w-4" />}
      onClick={async () => {
        setLoading(true);
        try {
          await downloadFile(`/customer/invoices/${id}/pdf`, undefined, name);
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setLoading(false);
        }
      }}
    >
      Download PDF
    </Button>
  );
}

function CancelModal({ open, onClose, booking: b, onDone }: { open: boolean; onClose: () => void; booking: BookingDetail; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const preview = b.cancellationPreview;

  async function confirm() {
    if (reason.trim().length < 3) return setError('Please tell us why you are cancelling');
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ refundAmount: number }>(`/customer/bookings/${b.id}/cancel`, { body: { reason: reason.trim() } });
      toast.success(r.refundAmount > 0 ? `Booking cancelled. Refund of ${inr(r.refundAmount)} initiated.` : 'Booking cancelled.');
      onClose();
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.fieldErrors.reason || e.message : errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this booking?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep booking</Button>
          <Button variant="danger" onClick={confirm} loading={loading}>Confirm cancellation</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-xl bg-mist-50 p-4">
          <p className="font-semibold text-navy-900">As per our cancellation policy</p>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-500">Time before pickup</dt><dd className="font-medium">{preview.hoursBefore} hours</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Amount paid</dt><dd className="font-medium">{inr(b.paidAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Refund ({preview.refundPercent}%)</dt><dd className="font-semibold text-emerald-700">{inr(preview.refundAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Cancellation fee</dt><dd className="font-semibold text-red-600">{inr(preview.fee)}</dd></div>
          </dl>
          {b.paidAmount === 0 && <p className="mt-2 text-xs text-slate-500">No payment has been made, so nothing will be charged.</p>}
          <Link href="/cancellation-policy" className="mt-2 inline-block text-xs font-semibold text-navy-600 underline" target="_blank">View full policy</Link>
        </div>
        <Field label="Reason for cancellation" error={error ?? undefined} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Change of plans" maxLength={500} invalid={!!error} />
        </Field>
        <p className="text-xs text-slate-500">Refunds are credited to the original payment method within 5–7 working days.</p>
      </div>
    </Modal>
  );
}

function ReviewForm({ bookingId, hasDriver, onDone }: { bookingId: string; hasDriver: boolean; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [vehicleRating, setVehicleRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError('Please give an overall rating');
    setLoading(true);
    setError(null);
    try {
      await api(`/customer/bookings/${bookingId}/review`, {
        body: { rating, vehicleRating: vehicleRating || undefined, driverRating: hasDriver && driverRating ? driverRating : undefined, comment: comment.trim() || undefined },
      });
      toast.success('Thank you for your review!');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Rate your trip" subtitle="Your feedback helps other travellers and our partners." />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StarInput label="Overall" value={rating} onChange={setRating} />
          <StarInput label="Vehicle" value={vehicleRating} onChange={setVehicleRating} />
          {hasDriver && <StarInput label="Driver" value={driverRating} onChange={setDriverRating} />}
        </div>
        <Field label="Comments (optional)">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the vehicle, driver and overall experience?" maxLength={2000} />
        </Field>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <Button type="submit" variant="gold" loading={loading}>Submit review</Button>
      </form>
    </Card>
  );
}

function ReviewDisplay({ review }: { review: NonNullable<BookingDetail['review']> }) {
  return (
    <Card>
      <CardHeader title="Your review" />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">Overall <Stars value={review.rating} /></span>
        {review.vehicleRating && <span className="flex items-center gap-2">Vehicle <Stars value={review.vehicleRating} /></span>}
        {review.driverRating && <span className="flex items-center gap-2">Driver <Stars value={review.driverRating} /></span>}
      </div>
      {review.comment && <p className="mt-3 text-sm text-slate-700">“{review.comment}”</p>}
    </Card>
  );
}
