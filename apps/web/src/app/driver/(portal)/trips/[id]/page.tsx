'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, Car, Check, CheckCircle2, Flag, Phone, Play, Truck, Users, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, inr, PURPOSE_LABEL, TRIP_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, ErrorState, Modal, Skeleton, StatusBadge } from '@/components/ui/Display';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Banner, handleFormError, MoneyRow, RouteList, StatusTimeline } from '@/components/partner/common';
import { DeclineModal } from '@/components/partner/TripCard';
import type { BookingDetail, FinalBill } from '@/components/partner/types';

type ModalKind = 'decline' | 'start' | 'complete' | 'collect' | null;

export default function DriverTripPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: t, error, loading, reload } = useApi<BookingDetail>(`/driver/trips/${id}`);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bill, setBill] = useState<FinalBill | null>(null);

  if (error && !t) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !t) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (!t) return null;

  const mine = t.assignments.find((a) => a.driverId === user?.driver?.id && a.status !== 'CANCELLED') ?? t.assignments.find((a) => a.driverId === user?.driver?.id);
  const isAssignee = t.driver?.id === user?.driver?.id;
  const awaitingResponse = mine?.status === 'ASSIGNED' && t.status === 'DRIVER_ASSIGNED';
  const accepted = mine?.status === 'ACCEPTED' || mine?.status === 'COMPLETED';
  const total = t.finalAmount ?? t.totalAmount;
  const balance = t.balanceDue ?? Math.max(0, total - t.paidAmount);
  const finalBill = bill ?? t.extraCharges;

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      setModal(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const accept = () => run('accept', () => api(`/driver/trips/${id}/respond`, { body: { accept: true } }), 'Trip accepted');
  const decline = (note?: string) => run('decline', () => api(`/driver/trips/${id}/respond`, { body: { accept: false, note } }), 'Trip declined');
  const dispatch = () => run('dispatch', () => api(`/driver/trips/${id}/dispatch`, { method: 'POST' }), 'Customer notified that you are on the way');

  // Primary step actions in order.
  let actions: ReactNode = null;
  if (isAssignee && awaitingResponse) {
    actions = (
      <>
        <Button variant="outline" size="lg" className="flex-1 text-red-600" onClick={() => setModal('decline')} disabled={!!busy} icon={<X className="h-5 w-5" />}>
          Decline
        </Button>
        <Button variant="primary" size="lg" className="flex-1" loading={busy === 'accept'} onClick={accept} icon={<Check className="h-5 w-5" />}>
          Accept trip
        </Button>
      </>
    );
  } else if (isAssignee && accepted && ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(t.status)) {
    actions = (
      <>
        <Button variant="outline" size="lg" className="flex-1" onClick={() => setModal('start')} icon={<Play className="h-5 w-5" />}>
          Start trip
        </Button>
        <Button variant="gold" size="lg" className="flex-[1.4]" loading={busy === 'dispatch'} onClick={dispatch} icon={<Truck className="h-5 w-5" />}>
          On the way
        </Button>
      </>
    );
  } else if (isAssignee && t.status === 'VEHICLE_DISPATCHED') {
    actions = (
      <Button variant="gold" size="lg" className="flex-1" onClick={() => setModal('start')} icon={<Play className="h-5 w-5" />}>
        Start trip
      </Button>
    );
  } else if (isAssignee && t.status === 'TRIP_STARTED') {
    actions = (
      <>
        <Button variant="outline" size="lg" className="flex-1" onClick={() => setModal('collect')} icon={<Banknote className="h-5 w-5" />}>
          Collect cash
        </Button>
        <Button variant="gold" size="lg" className="flex-[1.4]" onClick={() => setModal('complete')} icon={<Flag className="h-5 w-5" />}>
          Complete trip
        </Button>
      </>
    );
  } else if (isAssignee && t.status === 'TRIP_COMPLETED' && balance > 0) {
    actions = (
      <Button variant="gold" size="lg" className="flex-1" onClick={() => setModal('collect')} icon={<Banknote className="h-5 w-5" />}>
        Collect cash · {inr(balance)}
      </Button>
    );
  }

  return (
    <div className={actions ? 'mx-auto max-w-3xl pb-28' : 'mx-auto max-w-3xl pb-6'}>
      <Link href="/driver/trips" className="mb-3 inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Trips
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Trip #{t.bookingNumber}</h1>
          <p className="text-sm text-slate-500">
            {PURPOSE_LABEL[t.purpose]} · {TRIP_LABEL[t.tripType]}
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>

      {awaitingResponse && <Banner tone="blue" title="New trip assigned to you">Review the details and accept or decline.</Banner>}
      {!isAssignee && t.status !== 'TRIP_COMPLETED' && <Banner tone="amber" title="This trip is no longer assigned to you" />}
      {t.status === 'CANCELLED' && <Banner tone="red" title="Trip cancelled">{t.cancellationReason ?? undefined}</Banner>}

      {t.status === 'TRIP_COMPLETED' && finalBill && (
        <Card className="mb-5 border-emerald-200">
          <CardHeader title={<span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Final bill</span>} subtitle={`${finalBill.actualKm} km driven`} />
          <BillBreakdown bill={finalBill} paid={t.paidAmount} balance={balance} />
        </Card>
      )}

      <div className="space-y-5">
        <Card>
          <CardHeader title="Customer" />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-lg font-bold text-navy-700">{(t.customer.name ?? 'C').slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-navy-900">{t.customer.name ?? 'Customer'}</p>
              <p className="text-sm text-slate-500">{t.customer.phone}</p>
            </div>
            <a href={`tel:${t.customer.phone}`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-4 font-semibold text-white active:scale-[.98]" aria-label={`Call ${t.customer.name ?? 'customer'}`}>
              <Phone className="h-5 w-5" /> Call
            </a>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {t.passengers} passengers · {t.luggageBags} bags
            </span>
            {t.decorationRequired && <span className="font-semibold text-gold-700">Wedding decoration</span>}
            {!t.acRequired && <span>Non-AC</span>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Schedule & route" />
          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-mist-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup</p>
              <p className="mt-0.5 font-semibold text-navy-900">{fmtDateTime(t.pickupAt)}</p>
            </div>
            <div className="rounded-xl bg-mist-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Return</p>
              <p className="mt-0.5 font-semibold text-navy-900">{fmtDateTime(t.returnAt)}</p>
            </div>
          </div>
          <RouteList pickupAddress={t.pickupAddress} dropAddress={t.dropAddress} locations={t.locations} showMaps />
          {t.specialRequests && (
            <div className="mt-5 rounded-xl bg-gold-50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Special requests</p>
              <p className="mt-1 whitespace-pre-line text-slate-800">{t.specialRequests}</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Vehicle" />
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-navy-50 p-3 text-navy-700">
              <Car className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-navy-900">{t.vehicle.title}</p>
              <p className="text-sm text-slate-500">
                <span className="font-mono font-semibold">{t.vehicle.registrationNumber}</span>
                {t.vehicle.color && ` · ${t.vehicle.color}`} · {t.vehicle.seats} seats
              </p>
            </div>
          </div>
          {t.startOdometer != null && (
            <p className="mt-3 text-sm text-slate-600">
              Odometer: <span className="font-semibold">{t.startOdometer}</span> → <span className="font-semibold">{t.endOdometer ?? '…'}</span> km
            </p>
          )}
        </Card>

        {t.status !== 'TRIP_COMPLETED' && (
          <Card>
            <CardHeader title="Payment" />
            <MoneyRow label="Trip total" value={inr(total)} />
            <MoneyRow label="Paid online" value={inr(t.paidAmount)} muted />
            <MoneyRow label="Balance to collect" value={inr(balance)} strong />
            <p className="mt-2 text-xs text-slate-500">Final amount may change for extra km, extra hours, tolls and parking when you complete the trip.</p>
          </Card>
        )}

        <Card>
          <CardHeader title="Status timeline" />
          <StatusTimeline history={t.statusHistory} />
        </Card>
      </div>

      {actions && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-mist-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-8px_24px_-12px_rgba(11,31,75,.25)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-3xl gap-2">{actions}</div>
        </div>
      )}

      <DeclineModal trip={modal === 'decline' ? t : null} onClose={() => setModal(null)} busy={busy === 'decline'} onConfirm={decline} />
      {modal === 'start' && <StartModal tripId={t.id} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'complete' && (
        <CompleteModal
          tripId={t.id}
          startOdometer={t.startOdometer}
          onClose={() => setModal(null)}
          onDone={(b) => {
            setBill(b);
            setModal(b.balance && b.balance > 0 ? 'collect' : null);
            reload();
          }}
        />
      )}
      {modal === 'collect' && <CollectModal tripId={t.id} defaultAmount={bill?.balance ?? balance} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function BillBreakdown({ bill, paid, balance }: { bill: FinalBill; paid: number; balance: number }) {
  return (
    <div>
      <MoneyRow label="Trip fare (incl. extras)" value={inr(bill.taxable)} />
      {bill.extraKm > 0 && <MoneyRow label={`↳ Extra ${bill.extraKm} km`} value={inr(bill.extraKmCharge)} muted />}
      {bill.extraHours > 0 && <MoneyRow label={`↳ Extra ${bill.extraHours} hr`} value={inr(bill.extraHourCharge)} muted />}
      <MoneyRow label="GST" value={inr(bill.gst)} />
      {bill.tolls > 0 && <MoneyRow label="Tolls" value={inr(bill.tolls)} />}
      {bill.parking > 0 && <MoneyRow label="Parking" value={inr(bill.parking)} />}
      {bill.stateTax > 0 && <MoneyRow label="State tax" value={inr(bill.stateTax)} />}
      <MoneyRow label="Total" value={inr(bill.total)} strong />
      <MoneyRow label="Paid" value={inr(paid)} muted />
      <div className={balance > 0 ? 'mt-2 flex items-center justify-between rounded-xl bg-gold-50 px-4 py-3 text-lg font-bold text-navy-900' : 'mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-lg font-bold text-emerald-800'}>
        <span>{balance > 0 ? 'Collect from customer' : 'Fully paid'}</span>
        <span className="tabular-nums">{inr(balance)}</span>
      </div>
    </div>
  );
}

function StartModal({ tripId, onClose, onDone }: { tripId: string; onClose: () => void; onDone: () => void }) {
  const [odo, setOdo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (odo === '' || Number(odo) < 0) return setErr('Enter the current odometer reading');
    setBusy(true);
    setErr(null);
    try {
      await api(`/driver/trips/${tripId}/start`, { body: { startOdometer: Number(odo) } });
      toast.success('Trip started — drive safe!');
      onDone();
    } catch (e2) {
      setErr(handleFormError(e2, (fe) => fe.startOdometer && setErr(fe.startOdometer)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Start trip"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" size="lg" loading={busy} onClick={() => submit()} icon={<Play className="h-5 w-5" />}>
            Start trip
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Starting odometer (km)" required error={err ?? undefined} hint="Read it from the dashboard before the customer boards.">
          <Input type="number" inputMode="numeric" min={0} autoFocus value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ''))} className="h-14 text-center font-mono text-2xl" invalid={!!err} />
        </Field>
      </form>
    </Modal>
  );
}

function CompleteModal({ tripId, startOdometer, onClose, onDone }: { tripId: string; startOdometer: number | null; onClose: () => void; onDone: (b: FinalBill) => void }) {
  const [f, setF] = useState({ endOdometer: '', tolls: '', parking: '', stateTax: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };
  const km = f.endOdometer && startOdometer != null ? Number(f.endOdometer) - startOdometer : null;

  async function submit() {
    setErr(null);
    if (!f.endOdometer) return setErrors({ endOdometer: 'Enter the closing odometer reading' });
    if (startOdometer != null && Number(f.endOdometer) < startOdometer) return setErrors({ endOdometer: `Must be at least ${startOdometer}` });
    setBusy(true);
    try {
      const bill = await api<FinalBill>(`/driver/trips/${tripId}/complete`, {
        body: {
          endOdometer: Number(f.endOdometer),
          tolls: Number(f.tolls || 0),
          parking: Number(f.parking || 0),
          ...(f.stateTax !== '' ? { stateTax: Number(f.stateTax) } : {}),
          notes: f.notes.trim() || undefined,
        },
      });
      toast.success('Trip completed');
      onDone(bill);
    } catch (e) {
      setErr(handleFormError(e, setErrors));
    } finally {
      setBusy(false);
    }
  }

  const money = (k: 'tolls' | 'parking' | 'stateTax', label: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <Input type="number" inputMode="decimal" min={0} value={f[k]} onChange={(e) => set(k, e.target.value)} leading={<span className="text-sm font-semibold">₹</span>} className="h-12 text-base" invalid={!!errors[k]} />
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Complete trip"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" size="lg" loading={busy} onClick={submit} icon={<Flag className="h-5 w-5" />}>
            Complete & get bill
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Closing odometer (km)" required error={errors.endOdometer} hint={startOdometer != null ? `Started at ${startOdometer} km${km != null && km >= 0 ? ` · ${km} km driven` : ''}` : undefined}>
          <Input type="number" inputMode="numeric" min={startOdometer ?? 0} autoFocus value={f.endOdometer} onChange={(e) => set('endOdometer', e.target.value.replace(/\D/g, ''))} className="h-14 text-center font-mono text-2xl" invalid={!!errors.endOdometer} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {money('tolls', 'Tolls paid')}
          {money('parking', 'Parking paid')}
        </div>
        {money('stateTax', 'State entry tax', 'Leave blank to use the amount in the quote')}
        <Field label="Notes" error={errors.notes}>
          <Textarea rows={2} maxLength={500} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the office should know" className="text-base" />
        </Field>
        {err && <ErrorState message={err} />}
      </div>
    </Modal>
  );
}

function CollectModal({ tripId, defaultAmount, onClose, onDone }: { tripId: string; defaultAmount: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = Number(amount);
    if (!amount || !(n > 0)) return setErr('Enter the cash amount received');
    setBusy(true);
    setErr(null);
    try {
      await api(`/driver/trips/${tripId}/collect`, { body: { amount: n } });
      toast.success(`${inr(n)} cash recorded`);
      onDone();
    } catch (e) {
      setErr(handleFormError(e, (fe) => fe.amount && setErr(fe.amount)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Collect cash"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" size="lg" loading={busy} onClick={submit} icon={<Banknote className="h-5 w-5" />}>
            Record cash received
          </Button>
        </>
      }
    >
      {defaultAmount > 0 && (
        <p className="mb-4 rounded-xl bg-gold-50 px-4 py-3 text-sm text-navy-900">
          Balance due from customer: <strong>{inr(defaultAmount)}</strong>
        </p>
      )}
      <Field label="Amount received" required error={err ?? undefined} hint="Only record cash you have actually received. The customer gets a receipt.">
        <Input type="number" inputMode="decimal" min={1} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} leading={<span className="text-base font-semibold">₹</span>} className="h-14 text-2xl font-bold" invalid={!!err} />
      </Field>
    </Modal>
  );
}
