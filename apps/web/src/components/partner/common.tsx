'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, FileText, MapPin, Navigation, Upload, XCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { api, ApiError, errorMessage, openFile } from '@/lib/api';
import { fmtDate, fmtDateTime, STATUS_LABEL, titleCase } from '@/lib/format';
import { Badge, type Tone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Logo } from '@/components/layout/Logo';
import type { Doc, DocStatus, Location, StatusHistory, Verification, VehicleStatus } from './types';

// ───────────── Errors ─────────────
/** Maps an API error onto field errors; returns a message for a toast. */
export function handleFormError(e: unknown, setErrors: (e: Record<string, string>) => void): string {
  if (e instanceof ApiError) {
    const fe = e.fieldErrors;
    setErrors(fe);
    if (Object.keys(fe).length) return 'Please fix the highlighted fields';
  }
  return errorMessage(e);
}

// ───────────── Badges ─────────────
const VERIFY_TONE: Record<Verification, Tone> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };
export function VerifyBadge({ status, labels }: { status: Verification; labels?: Partial<Record<Verification, string>> }) {
  const def = { PENDING: 'Under review', APPROVED: 'Approved', REJECTED: 'Rejected' };
  return <Badge tone={VERIFY_TONE[status]}>{labels?.[status] ?? def[status]}</Badge>;
}

const DOC_TONE: Record<DocStatus, Tone> = { PENDING: 'amber', VERIFIED: 'green', REJECTED: 'red' };
export function DocStatusBadge({ status }: { status: DocStatus }) {
  return <Badge tone={DOC_TONE[status]}>{status === 'PENDING' ? 'Pending review' : titleCase(status)}</Badge>;
}

const VEHICLE_TONE: Record<VehicleStatus, Tone> = { PENDING_APPROVAL: 'amber', ACTIVE: 'green', INACTIVE: 'gray', MAINTENANCE: 'violet', REJECTED: 'red' };
export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  PENDING_APPROVAL: 'Awaiting approval',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  MAINTENANCE: 'Maintenance',
  REJECTED: 'Rejected',
};
export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return <Badge tone={VEHICLE_TONE[status]}>{VEHICLE_STATUS_LABEL[status]}</Badge>;
}

// ───────────── Public header (partner landing / login) ─────────────
export function PublicHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950/90 backdrop-blur">
      <div className="container flex h-16 items-center gap-4">
        <Link href="/" aria-label="Royal Ride home">
          <Logo className="h-8" dark />
        </Link>
        <span className="hidden rounded-md bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-300 sm:inline">Partners</span>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          <Link href="/" className="hidden rounded-lg px-3 py-2 font-medium text-navy-100 hover:text-white sm:block">
            Back to website
          </Link>
          {right}
        </nav>
      </div>
    </header>
  );
}

/** Minimal chrome for onboarding screens (no sidebar). */
export function SetupShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-h-screen bg-mist-50">
      <header className="border-b border-mist-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Link href="/">
            <Logo className="h-8" />
          </Link>
          <span className="ml-auto rounded-md bg-gold-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-700">{label}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              i < current ? 'bg-emerald-600 text-white' : i === current ? 'bg-navy-900 text-white' : 'bg-mist-200 text-slate-500',
            )}
          >
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </span>
          <span className={clsx('hidden text-sm font-semibold sm:block', i === current ? 'text-navy-900' : 'text-slate-500')}>{s}</span>
          {i < steps.length - 1 && <span className="h-px flex-1 bg-mist-300" />}
        </li>
      ))}
    </ol>
  );
}

// ───────────── Banner ─────────────
export function Banner({ tone = 'amber', title, children, action }: { tone?: 'amber' | 'red' | 'blue' | 'green'; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-sky-200 bg-sky-50 text-sky-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  const Icon = tone === 'red' ? XCircle : tone === 'green' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={clsx('mb-6 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-4 sm:px-5', cls)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ───────────── Documents ─────────────
export const DOC_LABEL: Record<string, string> = {
  RC: 'Registration Certificate (RC)',
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate',
  PERMIT: 'Permit',
  PUC: 'Pollution (PUC)',
  DRIVING_LICENCE: 'Driving licence',
  AADHAAR: 'Aadhaar',
  PAN: 'PAN card',
  POLICE_VERIFICATION: 'Police verification',
  BANK_PROOF: 'Bank proof (cheque / passbook)',
  OTHER: 'Other',
};

/** Upload a document to an endpoint as multipart (file + type + number [+ expiresAt]). */
export function DocUploader({
  endpoint,
  types,
  withExpiry = false,
  expiryRequiredFor = [],
  defaultType,
  onUploaded,
  submitLabel = 'Upload document',
}: {
  endpoint: string;
  types: string[];
  withExpiry?: boolean;
  expiryRequiredFor?: string[];
  defaultType?: string;
  onUploaded?: (doc: Doc) => void;
  submitLabel?: string;
}) {
  const [type, setType] = useState(defaultType ?? types[0]);
  const [number, setNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError('Choose a file to upload');
    if (file.size > 8 * 1024 * 1024) return setError('File must be 8 MB or smaller');
    if (withExpiry && expiryRequiredFor.includes(type) && !expiresAt) return setError('Enter the expiry date for this document');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    if (number.trim()) fd.append('number', number.trim());
    if (withExpiry && expiresAt) fd.append('expiresAt', expiresAt);
    setBusy(true);
    try {
      const doc = await api<Doc>(endpoint, { method: 'POST', body: fd });
      toast.success(`${DOC_LABEL[type] ?? type} uploaded`);
      setFile(null);
      setNumber('');
      setExpiresAt('');
      if (ref.current) ref.current.value = '';
      onUploaded?.(doc);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={clsx('grid gap-4', withExpiry ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <Field label="Document type" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {DOC_LABEL[t] ?? titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Document number">
          <Input value={number} maxLength={60} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="Optional" />
        </Field>
        {withExpiry && (
          <Field label="Valid until" required={expiryRequiredFor.includes(type)}>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        )}
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-mist-300 bg-mist-50 px-4 py-6 text-center transition hover:border-navy-300 hover:bg-white">
        <Upload className="h-6 w-6 text-navy-400" />
        <span className="text-sm font-semibold text-navy-900">{file ? file.name : 'Tap to choose a file'}</span>
        <span className="text-xs text-slate-500">JPG, PNG, WEBP or PDF · up to 8 MB</span>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <Button type="submit" loading={busy} icon={<Upload className="h-4 w-4" />} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}

export function DocList({ docs, empty = 'No documents uploaded yet.' }: { docs: Doc[]; empty?: string }) {
  const pathname = usePathname();
  const fileEndpoint = pathname.startsWith('/driver') ? '/driver/files' : '/owner/files';
  async function view(key: string) {
    try {
      await openFile(fileEndpoint, { key });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  if (!docs.length) return <p className="rounded-xl bg-mist-50 px-4 py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-mist-100 rounded-xl border border-mist-200">
      {docs.map((d) => {
        const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-navy-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy-900">{DOC_LABEL[d.type] ?? titleCase(d.type)}</p>
              <p className="text-xs text-slate-500">
                {d.number ? `${d.number} · ` : ''}Uploaded {fmtDate(d.createdAt)}
                {d.expiresAt && <span className={clsx(expired && 'font-semibold text-red-600')}> · {expired ? 'Expired' : 'Valid until'} {fmtDate(d.expiresAt)}</span>}
              </p>
              {d.note && <p className="mt-0.5 text-xs text-red-600">{d.note}</p>}
            </div>
            <DocStatusBadge status={d.status} />
            <button type="button" onClick={() => view(d.fileKey)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────── Timeline ─────────────
export function StatusTimeline({ history }: { history: StatusHistory[] }) {
  if (!history.length) return <p className="text-sm text-slate-500">No status updates yet.</p>;
  return (
    <ol className="relative space-y-4 border-l-2 border-mist-200 pl-5">
      {history.map((h, i) => {
        const last = i === history.length - 1;
        return (
          <li key={h.id} className="relative">
            <span className={clsx('absolute -left-[27px] top-0.5 rounded-full bg-white', last ? 'text-gold-500' : 'text-navy-400')}>
              {last ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 fill-current" />}
            </span>
            <p className="text-sm font-semibold text-navy-900">{STATUS_LABEL[h.toStatus] ?? h.toStatus}</p>
            {h.note && <p className="text-sm text-slate-600">{h.note}</p>}
            <p className="text-xs text-slate-400">{fmtDateTime(h.createdAt)}</p>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────── Route / locations ─────────────
export const mapsLink = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

export function RouteList({ pickupAddress, dropAddress, locations, showMaps = false }: { pickupAddress: string; dropAddress: string | null; locations: Location[]; showMaps?: boolean }) {
  const stops: { key: string; label: string; address: string; at?: string | null }[] = locations.length
    ? locations.map((l) => ({ key: l.id, label: l.type === 'PICKUP' ? 'Pickup' : l.type === 'DROP' ? 'Drop' : `Stop ${l.sequence}`, address: l.address, at: l.scheduledAt }))
    : [
        { key: 'p', label: 'Pickup', address: pickupAddress },
        ...(dropAddress ? [{ key: 'd', label: 'Drop', address: dropAddress }] : []),
      ];
  return (
    <ol className="space-y-3">
      {stops.map((s, i) => (
        <li key={s.key} className="flex items-start gap-3">
          <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', i === 0 ? 'bg-emerald-50 text-emerald-700' : i === stops.length - 1 ? 'bg-red-50 text-red-600' : 'bg-navy-50 text-navy-600')}>
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="text-sm font-medium text-slate-900">{s.address}</p>
            {s.at && <p className="text-xs text-slate-500">{fmtDateTime(s.at)}</p>}
          </div>
          {showMaps && (
            <a
              href={mapsLink(s.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50"
            >
              <Navigation className="h-4 w-4" />
              <span className="hidden sm:inline">Open in Google Maps</span>
              <span className="sm:hidden">Maps</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Row in a money breakdown. */
export function MoneyRow({ label, value, strong, muted, negative }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean; negative?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 py-1.5 text-sm', strong && 'border-t border-mist-200 pt-3 text-base font-bold text-navy-900', muted && 'text-slate-500')}>
      <span>{label}</span>
      <span className={clsx('tabular-nums', negative && 'text-red-600')}>{value}</span>
    </div>
  );
}

/** YYYY-MM-DD from an ISO date (for <input type="date">). */
export const dateInput = (d: string | null | undefined) => (d ? d.slice(0, 10) : '');

export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}
