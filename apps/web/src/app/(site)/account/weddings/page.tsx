'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarHeart, Car, CheckCircle2, ChevronDown, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, fmtDateTime, inr } from '@/lib/format';
import { Badge, EmptyState, ErrorState, Modal, Skeleton, StatusBadge, type Tone } from '@/components/ui/Display';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { WeddingRequest } from '@/components/site/siteTypes';

const STATUS: Record<WeddingRequest['status'], { label: string; tone: Tone }> = {
  ENQUIRY: { label: 'Awaiting quote', tone: 'amber' },
  QUOTED: { label: 'Quote ready', tone: 'gold' },
  ACCEPTED: { label: 'Quote accepted', tone: 'blue' },
  CONFIRMED: { label: 'Confirmed', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'gray' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
};

export default function AccountWeddings() {
  const { data, error, loading, reload } = useApi<WeddingRequest[]>('/customer/weddings');
  const [accepting, setAccepting] = useState<WeddingRequest | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!accepting) return;
    setBusy(true);
    try {
      await api(`/customer/weddings/${accepting.id}/accept`, { method: 'POST' });
      toast.success('Quote accepted! Our wedding desk will allocate your vehicles and be in touch.');
      setAccepting(null);
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Wedding requests</h1>
        <ButtonLink href="/weddings#request" variant="gold" size="sm">New wedding request</ButtonLink>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<CalendarHeart className="h-6 w-6" />} title="No wedding requests yet" description="Plan your wedding transport and get an itemised quote from our wedding desk." action={<ButtonLink href="/weddings" variant="gold">Plan my wedding</ButtonLink>} />
      ) : (
        <div className="space-y-4">
          {data.map((w) => (
            <WeddingCard key={w.id} w={w} onAccept={() => setAccepting(w)} />
          ))}
        </div>
      )}

      <Modal
        open={!!accepting}
        onClose={() => setAccepting(null)}
        title="Accept this quote?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAccepting(null)}>Not yet</Button>
            <Button variant="gold" onClick={accept} loading={busy}>Accept quote</Button>
          </>
        }
      >
        {accepting && (
          <p className="text-sm text-slate-600">
            You&apos;re accepting the quote of <strong className="text-navy-900">{inr(accepting.quotedAmount)}</strong> for request {accepting.requestNumber}. Our wedding desk will then allocate vehicles and share the booking and payment details.
          </p>
        )}
      </Modal>
    </div>
  );
}

function WeddingCard({ w, onAccept }: { w: WeddingRequest; onAccept: () => void }) {
  const [open, setOpen] = useState(w.status === 'QUOTED');
  const s = STATUS[w.status];
  const expired = w.quoteValidUntil && new Date(w.quoteValidUntil) < new Date();
  const qb = w.quoteBreakdown;
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <p className="font-mono text-xs text-slate-500">{w.requestNumber}</p>
          <h2 className="mt-0.5 flex items-center gap-2 font-semibold text-navy-900">
            <CalendarHeart className="h-4 w-4 text-pink-500" /> {fmtDate(w.weddingDate)} · {w.venueName}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /> {w.venueAddress}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <Car className="h-3.5 w-3.5" /> {w.totalVehicles} vehicles · {w.decoratedCars} decorated · {w.rentalMode === 'HOURLY' ? `${w.hours ?? '—'} hrs` : 'Full day'}
            {w.package && <> · {w.package.name}</>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          {w.quotedAmount != null && <p className="text-lg font-bold text-navy-900">{inr(w.quotedAmount)}</p>}
        </div>
      </div>

      {w.status === 'QUOTED' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gold-200 bg-gold-50 px-5 py-3">
          <p className="text-sm text-gold-900">
            {expired ? 'This quote has expired — contact us for a revised quote.' : `Quote valid until ${fmtDateTime(w.quoteValidUntil)}`}
          </p>
          {!expired && (
            <Button variant="gold" size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={onAccept}>
              Accept quote
            </Button>
          )}
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-mist-100 px-5 py-3 text-sm font-semibold text-navy-700 hover:bg-mist-50" aria-expanded={open}>
        {open ? 'Hide details' : 'View details'} <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-6 border-t border-mist-100 p-5 md:grid-cols-2">
          <div>
            <h3 className="label">Quote breakdown</h3>
            {qb?.items?.length ? (
              <div className="text-sm">
                <ul className="space-y-1.5">
                  {qb.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-slate-600">{it.description} <span className="text-slate-400">× {it.quantity}</span></span>
                      <span className="font-medium tabular-nums">{inr(it.quantity * it.unitPrice)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1 border-t border-mist-200 pt-3">
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{inr(qb.subtotal)}</dd></div>
                  {qb.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>− {inr(qb.discount)}</dd></div>}
                  <div className="flex justify-between"><dt className="text-slate-500">GST ({qb.gstPercent}%)</dt><dd>{inr(qb.gst)}</dd></div>
                  <div className="flex justify-between border-t-2 border-navy-900 pt-2 font-bold text-navy-900"><dt>Total</dt><dd>{inr(qb.total)}</dd></div>
                </dl>
                {w.quoteNotes && <p className="mt-3 rounded-xl bg-mist-50 p-3 text-xs text-slate-600">{w.quoteNotes}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Our wedding desk is preparing your quote. You&apos;ll be notified by SMS.</p>
            )}
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="label">Requirements</h3>
              <ul className="space-y-1 text-slate-700">
                <li>Bride car: {w.brideCar ? 'Yes' : 'No'} · Groom car: {w.groomCar ? 'Yes' : 'No'}</li>
                <li>Guest vehicles: {w.guestVehicles}{w.guestCount ? ` · ~${w.guestCount} guests` : ''}</li>
                {w.dropLocation && <li>Drop: {w.dropLocation}</li>}
                {w.decorationRequest && <li>Décor: {w.decorationRequest}</li>}
                {w.notes && <li>Notes: {w.notes}</li>}
              </ul>
            </div>
            {w.pickupPoints.length > 0 && (
              <div>
                <h3 className="label">Pickup points</h3>
                <ul className="space-y-1 text-slate-700">
                  {w.pickupPoints.map((p) => (
                    <li key={p.id}>{p.label ? <strong>{p.label}: </strong> : null}{p.address}{p.pickupTime ? ` · ${p.pickupTime}` : ''}{p.passengers ? ` · ${p.passengers} pax` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            {w.events && w.events.length > 0 && (
              <div>
                <h3 className="label">Events</h3>
                <ul className="space-y-1 text-slate-700">
                  {w.events.map((e, i) => (
                    <li key={i}>{e.name} · {e.date ? fmtDate(e.date) : '—'} · {e.vehicles} vehicle(s){e.notes ? ` — ${e.notes}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            {w.bookings.length > 0 && (
              <div>
                <h3 className="label">Allocated bookings</h3>
                <ul className="space-y-1.5">
                  {w.bookings.map((bk) => (
                    <li key={bk.id} className="flex items-center justify-between gap-2">
                      <Link href={`/account/bookings/${bk.id}`} className="font-medium text-navy-700 hover:underline">{bk.bookingNumber} · {bk.vehicle.title}</Link>
                      <StatusBadge status={bk.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
