'use client';

import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Flag, IndianRupee, MessageSquarePlus, Play, RotateCcw, Truck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { inr } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal, Skeleton } from '@/components/ui/Display';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from './ConfirmDialog';
import { FormGrid } from './bits';
import { reportError } from './utils';

export interface ActionBooking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  withDriver: boolean;
  driverId: string | null;
  totalAmount: number;
  finalAmount: number | null;
  paidAmount: number;
  startOdometer: number | null;
  priceBreakdown: { lines?: { code: string; amount: number }[] } | null;
  cancellationPreview: { hoursBefore: number; refundPercent: number; refundAmount: number; fee: number };
}

interface AvailDriver {
  id: string;
  licenceNumber: string;
  experienceYears: number;
  ratingAvg: number;
  ratingCount: number;
  languages: string[];
  dailyWage: number;
  user: { name: string | null; phone: string };
  owner: { businessName: string } | null;
}

type ActionKey = 'assign' | 'dispatch' | 'start' | 'complete' | 'confirm' | 'cancel' | 'payment' | 'note' | 'refund' | null;

/** Action toolbar + modals for the admin booking detail page. */
export function BookingActions({ b, canWrite, canPay, canRefund, onDone }: { b: ActionBooking; canWrite: boolean; canPay: boolean; canRefund: boolean; onDone: () => void }) {
  const [open, setOpen] = useState<ActionKey>(null);
  const close = () => setOpen(null);
  const s = b.status;
  const total = Number(b.finalAmount ?? b.totalAmount);
  const paid = Number(b.paidAmount);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);

  const canAssign = canWrite && b.withDriver && (s === 'CONFIRMED' || s === 'DRIVER_ASSIGNED');
  const canDispatch = canWrite && (s === 'CONFIRMED' || s === 'DRIVER_ASSIGNED');
  const canStart = canWrite && (s === 'CONFIRMED' || s === 'DRIVER_ASSIGNED' || s === 'VEHICLE_DISPATCHED');
  const canComplete = canWrite && s === 'TRIP_STARTED';
  const canConfirm = canWrite && (s === 'PENDING' || s === 'AWAITING_PAYMENT' || s === 'CANCELLED');
  const canCancel = canWrite && ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED'].includes(s);
  const canRecord = canPay && balance > 0 && !['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'].includes(s);
  const canInitRefund = canRefund && paid > 0;

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      onDone();
    } catch (e) {
      reportError(e);
      throw e;
    }
  }

  if (!canWrite && !canPay && !canRefund) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canAssign && (
          <Button size="sm" variant="gold" icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen('assign')}>
            {b.driverId ? 'Reassign driver' : 'Assign driver'}
          </Button>
        )}
        {canDispatch && (
          <Button size="sm" variant="outline" icon={<Truck className="h-4 w-4" />} onClick={() => setOpen('dispatch')}>
            Dispatch
          </Button>
        )}
        {canStart && (
          <Button size="sm" variant="outline" icon={<Play className="h-4 w-4" />} onClick={() => setOpen('start')}>
            Start trip
          </Button>
        )}
        {canComplete && (
          <Button size="sm" variant="primary" icon={<Flag className="h-4 w-4" />} onClick={() => setOpen('complete')}>
            Complete trip
          </Button>
        )}
        {canConfirm && (
          <Button size="sm" variant="outline" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setOpen('confirm')}>
            {s === 'CANCELLED' ? 'Reinstate (confirm)' : 'Confirm manually'}
          </Button>
        )}
        {canRecord && (
          <Button size="sm" variant="outline" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setOpen('payment')}>
            Record payment
          </Button>
        )}
        {canInitRefund && (
          <Button size="sm" variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setOpen('refund')}>
            Initiate refund
          </Button>
        )}
        {canWrite && (
          <Button size="sm" variant="ghost" icon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => setOpen('note')}>
            Add note
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setOpen('cancel')}>
            Cancel
          </Button>
        )}
      </div>

      {open === 'assign' && <AssignDriverModal b={b} onClose={close} onDone={onDone} />}

      <ConfirmDialog
        open={open === 'dispatch'}
        onClose={close}
        title="Dispatch vehicle"
        message={`Mark ${b.bookingNumber} as dispatched to the pickup location? The customer will be notified.`}
        confirmLabel="Dispatch"
        tone="primary"
        onConfirm={() => run(() => api(`/admin/bookings/${b.id}/status`, { method: 'POST', body: { action: 'dispatch' } }), 'Vehicle dispatched')}
      />

      <ConfirmDialog
        open={open === 'confirm'}
        onClose={close}
        title={s === 'CANCELLED' ? 'Reinstate booking' : 'Confirm booking manually'}
        message={
          s === 'CANCELLED'
            ? 'Move this cancelled booking back to Confirmed and re-reserve the vehicle slot.'
            : 'Confirm without online payment (e.g. corporate credit or offline arrangement). The vehicle slot will be held permanently.'
        }
        confirmLabel="Confirm"
        tone="primary"
        reason="Note (optional)"
        onConfirm={(note) => run(() => api(`/admin/bookings/${b.id}/status`, { method: 'POST', body: { action: 'confirm', note: note || undefined } }), 'Booking confirmed')}
      />

      <ConfirmDialog
        open={open === 'note'}
        onClose={close}
        title="Add internal note"
        message="Notes are recorded on the booking timeline."
        confirmLabel="Save note"
        tone="primary"
        reason="Note"
        reasonRequired
        onConfirm={(note) => run(() => api(`/admin/bookings/${b.id}/notes`, { method: 'PATCH', body: { note } }), 'Note added')}
      />

      {open === 'start' && <StartModal b={b} onClose={close} run={run} />}
      {open === 'complete' && <CompleteModal b={b} onClose={close} run={run} />}
      {open === 'cancel' && <CancelModal b={b} onClose={close} run={run} />}
      {open === 'payment' && <PaymentModal b={b} balance={balance} onClose={close} run={run} />}
      {open === 'refund' && <RefundModal b={b} onClose={close} run={run} />}
    </>
  );
}

type Runner = (fn: () => Promise<unknown>, msg: string) => Promise<void>;

function useSubmit(run: Runner, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setErrors({});
    try {
      await run(fn, msg);
      onClose();
    } catch (e) {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe) setErrors(fe);
    } finally {
      setBusy(false);
    }
  }
  return { busy, errors, submit };
}

function AssignDriverModal({ b, onClose, onDone }: { b: ActionBooking; onClose: () => void; onDone: () => void }) {
  const { data, loading, error } = useApi<AvailDriver[]>(`/admin/bookings/${b.id}/available-drivers`);
  const [busy, setBusy] = useState<string | null>(null);
  async function assign(id: string) {
    setBusy(id);
    try {
      await api(`/admin/bookings/${b.id}/assign-driver`, { method: 'POST', body: { driverId: id } });
      toast.success('Driver assigned');
      onDone();
      onClose();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open onClose={onClose} title="Assign driver" size="lg">
      <p className="mb-4 text-sm text-slate-500">Verified drivers with a valid licence and no overlapping trips.</p>
      {loading && <Skeleton className="h-40" />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && !data.length && <p className="rounded-xl bg-mist-50 px-4 py-8 text-center text-sm text-slate-500">No drivers are available for this time slot.</p>}
      <ul className="divide-y divide-mist-100">
        {data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-navy-900">
                {d.user.name ?? 'Driver'} {d.id === b.driverId && <span className="ml-1 text-xs font-medium text-gold-700">(current)</span>}
              </p>
              <p className="text-xs text-slate-500">
                {d.user.phone} · {d.experienceYears} yrs · ★ {Number(d.ratingAvg).toFixed(1)} ({d.ratingCount}) · {d.owner?.businessName ?? 'Platform driver'}
                {d.languages?.length ? ` · ${d.languages.join(', ')}` : ''}
              </p>
            </div>
            <Button size="sm" variant={d.id === b.driverId ? 'outline' : 'primary'} disabled={d.id === b.driverId} loading={busy === d.id} onClick={() => assign(d.id)}>
              Assign
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function StartModal({ b, onClose, run }: { b: ActionBooking; onClose: () => void; run: Runner }) {
  const [odo, setOdo] = useState('');
  const { busy, errors, submit } = useSubmit(run, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title="Start trip"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={odo === ''} onClick={() => submit(() => api(`/admin/bookings/${b.id}/status`, { method: 'POST', body: { action: 'start', startOdometer: Number(odo) } }), 'Trip started')}>
            Start trip
          </Button>
        </>
      }
    >
      <Field label="Start odometer (km)" required error={errors.startOdometer} hint="Trips can start at most 3 hours before pickup and need an advance payment.">
        <Input type="number" min={0} value={odo} onChange={(e) => setOdo(e.target.value)} invalid={!!errors.startOdometer} autoFocus />
      </Field>
    </Modal>
  );
}

function CompleteModal({ b, onClose, run }: { b: ActionBooking; onClose: () => void; run: Runner }) {
  const quotedStateTax = (b.priceBreakdown?.lines ?? []).filter((l) => l.code === 'STATE_TAX').reduce((a, l) => a + Number(l.amount), 0);
  const [f, setF] = useState({ endOdometer: '', tolls: '0', parking: '0', stateTax: quotedStateTax ? String(quotedStateTax) : '', notes: '' });
  const { busy, errors, submit } = useSubmit(run, onClose);
  const km = f.endOdometer && b.startOdometer != null ? Number(f.endOdometer) - b.startOdometer : null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Complete trip"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={f.endOdometer === ''}
            onClick={() =>
              submit(
                () =>
                  api(`/admin/bookings/${b.id}/status`, {
                    method: 'POST',
                    body: {
                      action: 'complete',
                      endOdometer: Number(f.endOdometer),
                      tolls: Number(f.tolls || 0),
                      parking: Number(f.parking || 0),
                      stateTax: f.stateTax === '' ? undefined : Number(f.stateTax),
                      notes: f.notes || undefined,
                    },
                  }),
                'Trip completed — final bill generated',
              )
            }
          >
            Complete trip
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="End odometer (km)" required error={errors.endOdometer} hint={b.startOdometer != null ? `Start: ${b.startOdometer} km${km != null ? ` · ${km} km driven` : ''}` : undefined}>
          <Input type="number" min={b.startOdometer ?? 0} value={f.endOdometer} onChange={(e) => setF({ ...f, endOdometer: e.target.value })} invalid={!!errors.endOdometer} autoFocus />
        </Field>
        <Field label="Tolls (₹)" error={errors.tolls}>
          <Input type="number" min={0} value={f.tolls} onChange={(e) => setF({ ...f, tolls: e.target.value })} />
        </Field>
        <Field label="Parking (₹)" error={errors.parking}>
          <Input type="number" min={0} value={f.parking} onChange={(e) => setF({ ...f, parking: e.target.value })} />
        </Field>
        <Field label="State tax (₹)" error={errors.stateTax} hint="Leave blank to use the quoted amount">
          <Input type="number" min={0} value={f.stateTax} onChange={(e) => setF({ ...f, stateTax: e.target.value })} />
        </Field>
      </FormGrid>
      <Field label="Notes" className="mt-4" error={errors.notes}>
        <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
    </Modal>
  );
}

function CancelModal({ b, onClose, run }: { b: ActionBooking; onClose: () => void; run: Runner }) {
  const p = b.cancellationPreview;
  const paid = Number(b.paidAmount);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(String(p?.refundAmount ?? 0));
  const { busy, errors, submit } = useSubmit(run, onClose);
  const amt = Number(amount || 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${b.bookingNumber}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 3 || amt < 0 || amt > paid}
            onClick={() => submit(() => api(`/admin/bookings/${b.id}/cancel`, { method: 'POST', body: { reason: reason.trim(), refundAmount: paid > 0 ? amt : undefined } }), 'Booking cancelled')}
          >
            Cancel booking
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl border border-mist-200 bg-mist-50 p-4 text-sm">
        <p className="text-slate-600">
          Paid so far: <strong className="text-navy-900">{inr(paid)}</strong>
        </p>
        {p && (
          <p className="mt-1 text-slate-600">
            Policy ({p.hoursBefore} h before pickup): <strong className="text-navy-900">{p.refundPercent}% refund</strong> = {inr(p.refundAmount)} (fee {inr(p.fee)})
          </p>
        )}
      </div>
      <Field label="Reason" required error={errors.reason}>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason} placeholder="Shown on the booking timeline and to the customer" />
      </Field>
      {paid > 0 && (
        <Field label="Refund amount (₹)" className="mt-4" error={errors.refundAmount ?? (amt > paid ? `Cannot exceed ${inr(paid)}` : undefined)} hint="Prefilled from the cancellation policy. You may override it.">
          <Input type="number" min={0} max={paid} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={amt > paid} />
        </Field>
      )}
    </Modal>
  );
}

function PaymentModal({ b, balance, onClose, run }: { b: ActionBooking; balance: number; onClose: () => void; run: Runner }) {
  const [f, setF] = useState({ amount: String(balance), method: 'CASH', reference: '' });
  const { busy, errors, submit } = useSubmit(run, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title="Record offline payment"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!Number(f.amount)}
            onClick={() => submit(() => api(`/admin/bookings/${b.id}/payments`, { method: 'POST', body: { amount: Number(f.amount), method: f.method, reference: f.reference || undefined } }), 'Payment recorded')}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount (₹)" required error={errors.amount} hint={`Balance due: ${inr(balance)}`}>
          <Input type="number" min={1} max={balance} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} invalid={!!errors.amount} />
        </Field>
        <Field label="Method" required error={errors.method}>
          <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer / UPI</option>
          </Select>
        </Field>
        <Field label="Reference" error={errors.reference} hint="Receipt number, UTR or UPI reference">
          <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={60} />
        </Field>
      </div>
    </Modal>
  );
}

function RefundModal({ b, onClose, run }: { b: ActionBooking; onClose: () => void; run: Runner }) {
  const [f, setF] = useState({ amount: '', reason: '' });
  const { busy, errors, submit } = useSubmit(run, onClose);
  useEffect(() => setF({ amount: String(b.cancellationPreview?.refundAmount || ''), reason: '' }), [b]);
  return (
    <Modal
      open
      onClose={onClose}
      title="Initiate refund"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            loading={busy}
            disabled={!Number(f.amount) || f.reason.trim().length < 3}
            onClick={() => submit(() => api('/admin/refunds', { method: 'POST', body: { bookingId: b.id, amount: Number(f.amount), reason: f.reason.trim() } }), 'Refund initiated')}
          >
            Initiate refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount (₹)" required error={errors.amount} hint={`Paid: ${inr(Number(b.paidAmount))}. Gateway payments are refunded to source; cash/bank refunds must be settled manually.`}>
          <Input type="number" min={1} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} invalid={!!errors.amount} />
        </Field>
        <Field label="Reason" required error={errors.reason}>
          <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} invalid={!!errors.reason} />
        </Field>
      </div>
    </Modal>
  );
}
