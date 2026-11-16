'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { fmtDate, fmtTime, TRIP_LABEL } from '@/lib/format';
import { Modal, StatusBadge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import type { DriverTrip } from './types';

export function TripCard({ t, actions, highlight }: { t: DriverTrip; actions?: ReactNode; highlight?: boolean }) {
  const drop = t.locations.find((l) => l.type === 'DROP')?.address ?? t.dropAddress;
  return (
    <div className={highlight ? 'card overflow-hidden ring-2 ring-gold-400' : 'card overflow-hidden'}>
      <Link href={`/driver/trips/${t.id}`} className="block p-4 active:bg-mist-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <CalendarClock className="h-4 w-4 text-gold-600" />
            {fmtDate(t.pickupAt)} · {fmtTime(t.pickupAt)}
          </div>
          <StatusBadge status={t.status} />
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span className="line-clamp-2 text-slate-800">{t.pickupAddress}</span>
          </p>
          {drop && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span className="line-clamp-2 text-slate-800">{drop}</span>
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="truncate">
            {t.vehicle.title} · <span className="font-mono">{t.vehicle.registrationNumber}</span> · {TRIP_LABEL[t.tripType]}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </div>
      </Link>
      {actions && <div className="flex gap-2 border-t border-mist-100 bg-mist-50 p-3">{actions}</div>}
    </div>
  );
}

export function DeclineModal({ trip, onClose, onConfirm, busy }: { trip: { id: string } | null; onClose: () => void; onConfirm: (note?: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={!!trip}
      onClose={onClose}
      title="Decline this trip?"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" size="lg" loading={busy} onClick={() => onConfirm(note.trim() || undefined)}>
            Decline trip
          </Button>
        </>
      }
    >
      <Field label="Reason (optional)">
        <Textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Not available on this date" className="text-base" />
      </Field>
    </Modal>
  );
}
