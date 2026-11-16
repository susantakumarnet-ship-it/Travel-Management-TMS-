'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, MapPin, Star } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { downloadFile } from '@/lib/api';
import { PURPOSE_LABEL, STATUS_LABEL, TRIP_LABEL, fmtDateTime, inr, titleCase } from '@/lib/format';
import type { BookingStatus, Quote, TravelPurpose, TripType } from '@/lib/types';
import { Badge, DL, ErrorState, PageHeader, StatusBadge } from '@/components/ui/Display';
import { BackLink, EnumBadge, PageSkeleton, Section } from '@/components/admin/bits';
import { PriceBreakdownTable } from '@/components/admin/PriceBreakdownTable';
import { BookingActions } from '@/components/admin/BookingActions';
import { usePerm } from '@/components/admin/hooks';
import { PAYMENT_STATUS_TONE, REFUND_STATUS_TONE, reportError } from '@/components/admin/utils';

interface BookingDetail {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  purpose: TravelPurpose;
  tripType: TripType;
  withDriver: boolean;
  driverId: string | null;
  weddingRequestId: string | null;
  pickupAt: string;
  returnAt: string;
  pickupAddress: string;
  dropAddress: string | null;
  estimatedKm: number;
  passengers: number;
  luggageBags: number;
  acRequired: boolean;
  decorationRequired: boolean;
  specialRequests: string | null;
  ownerDecision: string;
  ownerNote: string | null;
  priceBreakdown: Quote | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  advanceAmount: number;
  paidAmount: number;
  securityDeposit: number;
  startOdometer: number | null;
  endOdometer: number | null;
  startedAt: string | null;
  completedAt: string | null;
  extraCharges: Record<string, number> | null;
  finalAmount: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationFee: number | null;
  commissionRate: number;
  commissionAmount: number;
  ownerPayout: number;
  settlementId: string | null;
  createdAt: string;
  vehicle: { id: string; title: string; registrationNumber: string; category: { name: string }; city: { name: string } };
  owner: { id: string; businessName: string; user: { phone: string; name: string | null } };
  driver: { id: string; ratingAvg: number; licenceNumber: string; user: { name: string | null; phone: string } } | null;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  locations: { id: string; type: string; sequence: number; address: string; scheduledAt: string | null }[];
  passengersList: { id: string; name: string; phone: string | null; age: number | null; isPrimary: boolean }[];
  payments: { id: string; gateway: string; purpose: string; amount: number; status: string; method: string | null; gatewayPaymentId: string | null; gatewayOrderId: string | null; capturedAt: string | null; createdAt: string; failureReason: string | null }[];
  refunds: { id: string; amount: number; status: string; reason: string | null; gatewayRefundId: string | null; processedAt: string | null; createdAt: string; failureReason: string | null }[];
  invoices: { id: string; invoiceNumber: string; type: string; total: number; issuedAt: string }[];
  statusHistory: { id: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; note: string | null; createdAt: string }[];
  review: { rating: number; comment: string | null; status: string } | null;
  assignments: { id: string; status: string; assignedAt: string; respondedAt: string | null; note: string | null; driverEarning: number; driver: { user: { name: string | null; phone: string } } }[];
  cancellationPreview: { hoursBefore: number; refundPercent: number; refundAmount: number; fee: number };
}

const BILL_LABELS: [string, string][] = [
  ['actualKm', 'Actual km'],
  ['coveredKm', 'Covered km'],
  ['extraKm', 'Extra km'],
  ['extraKmCharge', 'Extra km charge'],
  ['extraHours', 'Extra hours'],
  ['extraHourCharge', 'Extra hour charge'],
  ['tolls', 'Tolls'],
  ['parking', 'Parking'],
  ['stateTax', 'State tax'],
  ['taxable', 'Taxable'],
  ['gst', 'GST'],
  ['total', 'Final total'],
];
const MONEY_KEYS = new Set(['extraKmCharge', 'extraHourCharge', 'tolls', 'parking', 'stateTax', 'taxable', 'gst', 'total', 'passThrough']);

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: b, loading, error, reload } = useApi<BookingDetail>(`/admin/bookings/${id}`);
  const { canWrite } = usePerm('bookings');
  const pay = usePerm('payments');
  const ref = usePerm('refunds');

  if (loading && !b) return <PageSkeleton />;
  if (error || !b) return <ErrorState message={error ?? 'Booking not found'} onRetry={reload} />;

  const total = Number(b.finalAmount ?? b.totalAmount);
  const paid = Number(b.paidAmount);
  const refunded = b.refunds.filter((r) => r.status === 'PROCESSED').reduce((a, r) => a + Number(r.amount), 0);

  async function invoicePdf(inv: { id: string; invoiceNumber: string }) {
    try {
      await downloadFile(`/admin/invoices/${inv.id}/pdf`, undefined, `${inv.invoiceNumber.replace(/\//g, '-')}.pdf`);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div>
      <PageHeader
        back={<BackLink href="/admin/bookings" label="Bookings" />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.bookingNumber} <StatusBadge status={b.status} />
          </span>
        }
        subtitle={
          <>
            {PURPOSE_LABEL[b.purpose]} · {TRIP_LABEL[b.tripType]} · {b.withDriver ? 'With driver' : 'Self drive'} · Created {fmtDateTime(b.createdAt)}
            {b.weddingRequestId && (
              <>
                {' · '}
                <Link className="font-medium text-navy-700 underline" href={`/admin/weddings/${b.weddingRequestId}`}>
                  Wedding request
                </Link>
              </>
            )}
          </>
        }
      />

      <div className="card mb-6 p-4">
        <BookingActions b={b} canWrite={canWrite} canPay={pay.canWrite} canRefund={ref.canWrite} onDone={reload} />
        {!canWrite && !pay.canWrite && !ref.canWrite && <p className="text-sm text-slate-500">You have read-only access to bookings.</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Section title="Customer">
              <DL
                cols={1}
                items={[
                  ['Name', <Link key="c" href={`/admin/customers/${b.customer.id}`} className="text-navy-700 hover:underline">{b.customer.name ?? '—'}</Link>],
                  ['Phone', b.customer.phone],
                  ['Email', b.customer.email],
                ]}
              />
            </Section>
            <Section title="Vehicle & owner">
              <DL
                cols={1}
                items={[
                  ['Vehicle', <Link key="v" href={`/admin/vehicles/${b.vehicle.id}`} className="text-navy-700 hover:underline">{b.vehicle.title}</Link>],
                  ['Registration', `${b.vehicle.registrationNumber} · ${b.vehicle.category.name} · ${b.vehicle.city.name}`],
                  ['Owner', <Link key="o" href={`/admin/owners/${b.owner.id}`} className="text-navy-700 hover:underline">{b.owner.businessName}</Link>],
                  ['Owner decision', <span key="d">{titleCase(b.ownerDecision)}{b.ownerNote ? ` — ${b.ownerNote}` : ''}</span>],
                ]}
              />
            </Section>
          </div>

          <Section title="Trip details">
            <DL
              items={[
                ['Pickup', fmtDateTime(b.pickupAt)],
                ['Return', fmtDateTime(b.returnAt)],
                ['Pickup address', b.pickupAddress],
                ['Drop address', b.dropAddress],
                ['Estimated km', b.estimatedKm ? `${b.estimatedKm} km` : '—'],
                ['Passengers / bags', `${b.passengers} / ${b.luggageBags}`],
                ['AC / decoration', `${b.acRequired ? 'AC' : 'Non-AC'} · ${b.decorationRequired ? 'Decoration' : 'No decoration'}`],
                ['Odometer', b.startOdometer != null ? `${b.startOdometer} → ${b.endOdometer ?? '…'} km` : '—'],
                ['Started', fmtDateTime(b.startedAt)],
                ['Completed', fmtDateTime(b.completedAt)],
              ]}
            />
            {b.specialRequests && (
              <div className="mt-4 rounded-xl bg-gold-50 px-4 py-3 text-sm text-gold-900 ring-1 ring-gold-200">
                <span className="font-semibold">Special requests: </span>
                {b.specialRequests}
              </div>
            )}
            {b.locations.length > 0 && (
              <div className="mt-5">
                <p className="label">Route</p>
                <ol className="space-y-2">
                  {b.locations.map((l) => (
                    <li key={l.id} className="flex gap-3 text-sm">
                      <MapPin className={l.type === 'PICKUP' ? 'h-4 w-4 shrink-0 text-emerald-600' : l.type === 'DROP' ? 'h-4 w-4 shrink-0 text-red-600' : 'h-4 w-4 shrink-0 text-slate-400'} />
                      <span>
                        <span className="font-medium text-slate-500">{titleCase(l.type)}: </span>
                        {l.address}
                        {l.scheduledAt && <span className="text-xs text-slate-500"> · {fmtDateTime(l.scheduledAt)}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {b.passengersList.length > 0 && (
              <div className="mt-5">
                <p className="label">Passengers</p>
                <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {b.passengersList.map((p) => (
                    <li key={p.id} className="rounded-lg border border-mist-200 px-3 py-2">
                      <span className="font-medium text-navy-900">{p.name}</span>
                      {p.isPrimary && <Badge tone="gold" className="ml-2">Primary</Badge>}
                      <span className="block text-xs text-slate-500">
                        {[p.phone, p.age ? `${p.age} yrs` : null].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {b.cancelledAt && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Cancelled {fmtDateTime(b.cancelledAt)} — {b.cancellationReason}
                {b.cancellationFee != null && <> · Fee {inr(Number(b.cancellationFee))}</>}
              </div>
            )}
          </Section>

          <Section title="Price breakdown" subtitle="Snapshot from the pricing engine at booking time">
            <PriceBreakdownTable quote={b.priceBreakdown} />
            {b.extraCharges && (
              <div className="mt-6 border-t border-mist-200 pt-4">
                <p className="label">Final bill (trip actuals)</p>
                <DL
                  cols={3}
                  items={BILL_LABELS.filter(([k]) => b.extraCharges?.[k] != null).map(([k, label]) => [label, MONEY_KEYS.has(k) ? inr(Number(b.extraCharges![k])) : String(b.extraCharges![k])])}
                />
              </div>
            )}
          </Section>

          <Section title="Payments" padded={false}>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Gateway</th>
                    <th>Purpose</th>
                    <th>Reference</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(p.capturedAt ?? p.createdAt)}</td>
                      <td>
                        {titleCase(p.gateway)}
                        {p.method && <span className="block text-xs text-slate-500">{p.method}</span>}
                      </td>
                      <td>{titleCase(p.purpose)}</td>
                      <td className="max-w-[200px] truncate text-xs text-slate-500">{p.gatewayPaymentId ?? p.gatewayOrderId ?? '—'}</td>
                      <td className="text-right tabular-nums">{inr(Number(p.amount))}</td>
                      <td>
                        <EnumBadge value={p.status} tones={PAYMENT_STATUS_TONE} />
                        {p.failureReason && <span className="block text-xs text-red-600">{p.failureReason}</span>}
                      </td>
                    </tr>
                  ))}
                  {!b.payments.length && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No payments yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {b.refunds.length > 0 && (
            <Section title="Refunds" padded={false} action={<Link href="/admin/refunds" className="mr-5 text-sm font-medium text-navy-700 hover:underline">All refunds</Link>}>
              <div className="scrollbar-thin overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reason</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                        <td className="max-w-[240px]">{r.reason ?? '—'}</td>
                        <td className="text-xs text-slate-500">{r.gatewayRefundId ?? '—'}</td>
                        <td className="text-right tabular-nums">{inr(Number(r.amount))}</td>
                        <td>
                          <EnumBadge value={r.status} tones={REFUND_STATUS_TONE} />
                          {r.failureReason && <span className="block text-xs text-red-600">{r.failureReason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {b.assignments.length > 0 && (
            <Section title="Driver assignments">
              <ul className="divide-y divide-mist-100 text-sm">
                {b.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium text-navy-900">{a.driver.user.name ?? 'Driver'}</span> <span className="text-slate-500">· {a.driver.user.phone}</span>
                      <span className="block text-xs text-slate-500">
                        Assigned {fmtDateTime(a.assignedAt)}
                        {a.respondedAt && ` · responded ${fmtDateTime(a.respondedAt)}`} · earning {inr(Number(a.driverEarning))}
                        {a.note && ` · ${a.note}`}
                      </span>
                    </span>
                    <Badge tone={a.status === 'REJECTED' || a.status === 'CANCELLED' ? 'red' : a.status === 'COMPLETED' ? 'green' : a.status === 'ACCEPTED' ? 'blue' : 'amber'}>{titleCase(a.status)}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Amounts">
            <dl className="space-y-2 text-sm">
              {(
                [
                  ['Booking total', inr(Number(b.totalAmount))],
                  b.finalAmount != null ? ['Final amount', inr(Number(b.finalAmount))] : null,
                  ['Advance', inr(Number(b.advanceAmount))],
                  ['Paid', inr(paid)],
                  refunded ? ['Refunded', `− ${inr(refunded)}`] : null,
                  ['Balance due', inr(Math.max(0, total - paid))],
                  Number(b.securityDeposit) ? ['Security deposit', inr(Number(b.securityDeposit))] : null,
                ].filter(Boolean) as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className={k === 'Balance due' ? 'font-bold text-navy-900' : 'font-medium text-slate-900'}>{v}</dd>
                </div>
              ))}
              <div className="my-2 border-t border-mist-200" />
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Commission ({Number(b.commissionRate)}%)</dt>
                <dd className="font-medium">{inr(Number(b.commissionAmount))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Owner payout</dt>
                <dd className="font-medium">{inr(Number(b.ownerPayout))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Settlement</dt>
                <dd className="font-medium">{b.settlementId ? 'Settled' : 'Unsettled'}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Driver">
            {b.driver ? (
              <DL
                cols={1}
                items={[
                  ['Name', <Link key="d" href={`/admin/drivers/${b.driver.id}`} className="text-navy-700 hover:underline">{b.driver.user.name ?? '—'}</Link>],
                  ['Phone', b.driver.user.phone],
                  ['Licence', b.driver.licenceNumber],
                  [
                    'Rating',
                    <span key="r" className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" /> {Number(b.driver.ratingAvg).toFixed(1)}
                    </span>,
                  ],
                ]}
              />
            ) : (
              <p className="text-sm text-slate-500">{b.withDriver ? 'No driver assigned yet.' : 'Self-drive booking.'}</p>
            )}
          </Section>

          <Section title="Invoices">
            {b.invoices.length ? (
              <ul className="space-y-2">
                {b.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-mist-200 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-navy-900">{inv.invoiceNumber}</span>
                      <span className="block text-xs text-slate-500">
                        {titleCase(inv.type)} · {inr(Number(inv.total))} · {fmtDateTime(inv.issuedAt)}
                      </span>
                    </span>
                    <button onClick={() => invoicePdf(inv)} className="rounded-lg p-2 text-navy-700 hover:bg-mist-100" aria-label="Download PDF" title="Download PDF">
                      <Download className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No invoices issued yet.</p>
            )}
          </Section>

          {b.review && (
            <Section title="Customer review">
              <p className="flex items-center gap-1 text-sm font-semibold text-navy-900">
                <Star className="h-4 w-4 fill-gold-500 text-gold-500" /> {b.review.rating}/5 <Badge className="ml-2">{titleCase(b.review.status)}</Badge>
              </p>
              {b.review.comment && <p className="mt-2 text-sm text-slate-600">{b.review.comment}</p>}
            </Section>
          )}

          <Section title="Timeline">
            <ol className="relative space-y-4 border-l border-mist-200 pl-5">
              {b.statusHistory.map((h) => {
                const isNote = h.fromStatus === h.toStatus;
                return (
                  <li key={h.id} className="relative">
                    <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${isNote ? 'bg-slate-300' : 'bg-gold-500'}`} />
                    <p className="text-sm font-semibold text-navy-900">{isNote ? 'Note' : STATUS_LABEL[h.toStatus]}</p>
                    {h.note && <p className="text-sm text-slate-600">{isNote ? h.note.replace(/^Note:\s*/, '') : h.note}</p>}
                    <p className="text-xs text-slate-400">{fmtDateTime(h.createdAt)}</p>
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}
