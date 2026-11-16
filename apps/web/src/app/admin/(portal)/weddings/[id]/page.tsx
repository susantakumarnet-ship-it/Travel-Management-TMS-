'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, openFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate, fmtDateTime, inr, titleCase } from '@/lib/format';
import type { BookingStatus, Paged } from '@/lib/types';
import { Badge, DL, ErrorState, Modal, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { BackLink, EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { QuoteBuilder, type QuoteBreakdown } from '@/components/admin/QuoteBuilder';
import { usePerm } from '@/components/admin/hooks';
import { WEDDING_STATUSES, WEDDING_STATUS_TONE, reportError } from '@/components/admin/utils';

interface WeddingEvent {
  name?: string;
  date?: string;
  vehicles?: number;
  notes?: string;
}
interface WeddingDetail {
  id: string;
  requestNumber: string;
  weddingDate: string;
  venueName: string;
  venueAddress: string;
  dropLocation: string | null;
  rentalMode: 'HOURLY' | 'FULL_DAY';
  hours: number | null;
  totalVehicles: number;
  brideCar: boolean;
  groomCar: boolean;
  guestVehicles: number;
  guestCount: number | null;
  decoratedCars: number;
  decorationRequest: string | null;
  events: WeddingEvent[] | null;
  itineraryFileKey: string | null;
  notes: string | null;
  status: string;
  quotedAmount: number | null;
  quoteBreakdown: QuoteBreakdown | null;
  quoteNotes: string | null;
  quotedAt: string | null;
  quoteValidUntil: string | null;
  createdAt: string;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  package: { id: string; name: string; tier: string; basePrice: number; includedHours: number; includedKm: number; vehicleCount: number; decorationIncluded: boolean; inclusions: string[] } | null;
  pickupPoints: { id: string; sequence: number; label: string | null; address: string; pickupTime: string | null; passengers: number | null }[];
  bookings: { id: string; bookingNumber: string; status: BookingStatus; pickupAt: string; totalAmount: number; vehicle: { title: string; registrationNumber: string }; driver: { user: { name: string | null } } | null }[];
  preferredCategories: { id: string; name: string }[];
}

export default function WeddingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: w, loading, error, reload } = useApi<WeddingDetail>(`/admin/weddings/${id}`);
  const { canWrite } = usePerm('weddings');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  if (loading && !w) return <PageSkeleton />;
  if (error || !w) return <ErrorState message={error ?? 'Wedding request not found'} onRetry={reload} />;

  async function changeStatus(status: string) {
    try {
      await api(`/admin/weddings/${id}/status`, { method: 'PATCH', body: { status } });
      toast.success(`Status changed to ${titleCase(status)}`);
      reload();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }
  async function viewItinerary() {
    try {
      await openFile('/admin/files', { key: w!.itineraryFileKey! });
    } catch (e) {
      reportError(e, 'Could not open the file');
    }
  }

  const events = Array.isArray(w.events) ? w.events : [];
  const suggestions = [
    ...(w.brideCar ? ['Decorated bride car'] : []),
    ...(w.groomCar ? ['Decorated groom car'] : []),
    ...(w.guestVehicles ? [`Guest vehicles (${w.guestVehicles})`] : []),
  ];
  const expired = w.quoteValidUntil && new Date(w.quoteValidUntil) < new Date();

  return (
    <div>
      <PageHeader
        back={<BackLink href="/admin/weddings" label="Wedding bookings" />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {w.requestNumber} <EnumBadge value={w.status} tones={WEDDING_STATUS_TONE} />
          </span>
        }
        subtitle={`Wedding on ${fmtDate(w.weddingDate)} · requested ${fmtDateTime(w.createdAt)}`}
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <Select
                className="h-10 w-44 py-0"
                value={w.status}
                onChange={(e) => {
                  const s = e.target.value;
                  if (s === 'CANCELLED' || s === 'COMPLETED') setPendingStatus(s);
                  else void changeStatus(s).catch(() => undefined);
                }}
                aria-label="Change status"
              >
                {WEDDING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Wedding details">
            <DL
              items={[
                ['Wedding date', fmtDate(w.weddingDate)],
                ['Rental mode', w.rentalMode === 'HOURLY' ? `Hourly${w.hours ? ` · ${w.hours} h` : ''}` : 'Full day'],
                ['Venue', w.venueName],
                ['Venue address', w.venueAddress],
                ['Drop location', w.dropLocation],
                ['Guest count', w.guestCount ?? '—'],
                ['Total vehicles', w.totalVehicles],
                ['Bride / groom car', `${w.brideCar ? 'Bride ✓' : 'Bride ✗'} · ${w.groomCar ? 'Groom ✓' : 'Groom ✗'}`],
                ['Guest vehicles', w.guestVehicles],
                ['Decorated cars', w.decoratedCars],
                ['Preferred categories', w.preferredCategories.length ? w.preferredCategories.map((c) => c.name).join(', ') : '—'],
                [
                  'Itinerary file',
                  w.itineraryFileKey ? (
                    <Button key="i" size="sm" variant="outline" icon={<FileText className="h-4 w-4" />} onClick={viewItinerary}>
                      View file
                    </Button>
                  ) : (
                    '—'
                  ),
                ],
              ]}
            />
            {w.decorationRequest && (
              <div className="mt-4 rounded-xl bg-gold-50 px-4 py-3 text-sm text-gold-900 ring-1 ring-gold-200">
                <span className="font-semibold">Decoration: </span>
                {w.decorationRequest}
              </div>
            )}
            {w.notes && (
              <div className="mt-3 rounded-xl bg-mist-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold">Notes: </span>
                {w.notes}
              </div>
            )}
          </Section>

          <Section title="Pickup points" padded={false}>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Label</th>
                    <th>Address</th>
                    <th>Time</th>
                    <th className="text-right">Passengers</th>
                  </tr>
                </thead>
                <tbody>
                  {w.pickupPoints.map((p) => (
                    <tr key={p.id}>
                      <td>{p.sequence}</td>
                      <td className="font-medium">{p.label ?? '—'}</td>
                      <td>{p.address}</td>
                      <td>{p.pickupTime ?? '—'}</td>
                      <td className="text-right">{p.passengers ?? '—'}</td>
                    </tr>
                  ))}
                  {!w.pickupPoints.length && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No pickup points provided
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {events.length > 0 && (
            <Section title="Events">
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {events.map((e, i) => (
                  <li key={i} className="rounded-xl border border-mist-200 p-3 text-sm">
                    <p className="font-semibold text-navy-900">{e.name ?? `Event ${i + 1}`}</p>
                    <p className="text-xs text-slate-500">
                      {e.date ? fmtDate(e.date) : 'Date TBD'} · {e.vehicles ?? 0} vehicle{e.vehicles === 1 ? '' : 's'}
                    </p>
                    {e.notes && <p className="mt-1 text-slate-600">{e.notes}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title="Quote builder"
            subtitle={canWrite ? 'Itemise vehicles, decoration and extras. Sending a quote sets the status to Quoted and notifies the customer.' : undefined}
          >
            <QuoteBuilder key={w.quotedAt ?? 'new'} requestId={w.id} initial={w.quoteBreakdown} suggestions={suggestions} disabled={!canWrite} onSaved={reload} />
          </Section>

          <Section
            title="Linked vehicle bookings"
            padded={false}
            action={
              canWrite ? (
                <Button size="sm" variant="outline" className="mr-5" icon={<Link2 className="h-4 w-4" />} onClick={() => setLinkOpen(true)}>
                  Link booking
                </Button>
              ) : undefined
            }
          >
            <div className="scrollbar-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Pickup</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {w.bookings.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/admin/bookings/${b.id}`} className="font-medium text-navy-700 hover:underline">
                          {b.bookingNumber}
                        </Link>
                      </td>
                      <td>
                        {b.vehicle.title}
                        <span className="block text-xs text-slate-500">{b.vehicle.registrationNumber}</span>
                      </td>
                      <td>{b.driver?.user.name ?? '—'}</td>
                      <td className="whitespace-nowrap">{fmtDateTime(b.pickupAt)}</td>
                      <td className="text-right tabular-nums">{inr(Number(b.totalAmount))}</td>
                      <td>
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                  {!w.bookings.length && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No bookings linked yet. Book vehicles for the customer, then link them here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Customer">
            <DL
              cols={1}
              items={[
                ['Name', <Link key="c" href={`/admin/customers/${w.customer.id}`} className="text-navy-700 hover:underline">{w.customer.name ?? '—'}</Link>],
                ['Phone', w.customer.phone],
                ['Email', w.customer.email],
              ]}
            />
          </Section>
          <Section title="Current quote">
            {w.quotedAmount != null ? (
              <>
                <p className="text-3xl font-bold text-navy-900">{inr(Number(w.quotedAmount))}</p>
                <p className="mt-1 text-sm text-slate-500">Sent {fmtDateTime(w.quotedAt)}</p>
                <p className={expired ? 'text-sm font-semibold text-red-600' : 'text-sm text-slate-500'}>
                  {expired ? 'Expired' : 'Valid until'} {fmtDate(w.quoteValidUntil)}
                </p>
                {w.quoteNotes && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{w.quoteNotes}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">No quote sent yet.</p>
            )}
          </Section>
          {w.package && (
            <Section title="Requested package">
              <p className="font-semibold text-navy-900">
                {w.package.name} <Badge tone="gold" className="ml-1">{titleCase(w.package.tier)}</Badge>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                From {inr(Number(w.package.basePrice))} · {w.package.vehicleCount} vehicle(s) · {w.package.includedHours} h / {w.package.includedKm} km
                {w.package.decorationIncluded ? ' · decoration included' : ''}
              </p>
              {w.package.inclusions?.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {w.package.inclusions.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        title={`Mark as ${pendingStatus ? titleCase(pendingStatus) : ''}?`}
        message={pendingStatus === 'CANCELLED' ? 'Linked vehicle bookings are not cancelled automatically — cancel them individually if needed.' : 'Mark this wedding request as completed.'}
        confirmLabel="Change status"
        tone={pendingStatus === 'CANCELLED' ? 'danger' : 'primary'}
        onConfirm={() => changeStatus(pendingStatus!)}
      />
      {linkOpen && <LinkBookingModal wedding={w} onClose={() => setLinkOpen(false)} onDone={reload} />}
    </div>
  );
}

interface BookingSearchRow {
  id: string;
  bookingNumber: string;
  customerId: string;
  weddingRequestId: string | null;
  status: BookingStatus;
  pickupAt: string;
  vehicle: { title: string };
}

function LinkBookingModal({ wedding, onClose, onDone }: { wedding: WeddingDetail; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState(wedding.customer.phone);
  const [term, setTerm] = useState(wedding.customer.phone);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading } = useApi<Paged<BookingSearchRow>>('/admin/bookings', { query: { q: term, pageSize: 50 } });
  const rows = (data?.items ?? []).filter((b) => b.customerId === wedding.customer.id && b.weddingRequestId !== wedding.id);

  async function link(bookingId: string) {
    setBusy(bookingId);
    try {
      await api(`/admin/weddings/${wedding.id}/link-booking`, { method: 'POST', body: { bookingId } });
      toast.success('Booking linked');
      onDone();
      onClose();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open onClose={onClose} title="Link a booking" size="lg">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking number or customer phone" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <p className="mb-3 text-xs text-slate-500">Only bookings made by {wedding.customer.name ?? wedding.customer.phone} can be linked.</p>
      {loading && <p className="text-sm text-slate-500">Searching…</p>}
      {!loading && !rows.length && <p className="rounded-xl bg-mist-50 px-4 py-8 text-center text-sm text-slate-500">No matching bookings for this customer.</p>}
      <ul className="divide-y divide-mist-100">
        {rows.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-navy-900">
                {b.bookingNumber} <StatusBadge status={b.status} />
              </p>
              <p className="text-xs text-slate-500">
                {b.vehicle.title} · {fmtDateTime(b.pickupAt)}
                {b.weddingRequestId && ' · linked to another wedding'}
              </p>
            </div>
            <Button size="sm" loading={busy === b.id} onClick={() => link(b.id)}>
              Link
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
