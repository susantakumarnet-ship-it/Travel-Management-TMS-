'use client';

import clsx from 'clsx';
import { Suspense, useState } from 'react';
import { ChevronDown, Mail, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paged } from '@/lib/types';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase, whatsappLink } from '@/lib/format';
import { ErrorState, EmptyState, PageHeader, Pagination, Skeleton } from '@/components/ui/Display';
import { Chips, FilterBar, FilterSelect } from '@/components/admin/FilterBar';
import { usePerm, useUrlFilters } from '@/components/admin/hooks';
import { EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { ENQUIRY_TONE, reportError } from '@/components/admin/utils';

interface Enquiry {
  id: string;
  type: 'CONTACT' | 'CUSTOM_TRAVEL' | 'CORPORATE' | 'WHATSAPP';
  name: string;
  phone: string;
  email: string | null;
  message: string;
  meta: Record<string, unknown> | null;
  status: 'NEW' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: string;
}

const TYPES = ['CONTACT', 'CUSTOM_TRAVEL', 'CORPORATE', 'WHATSAPP'] as const;
const STATUSES = ['NEW', 'IN_PROGRESS', 'CLOSED'] as const;

function metaValue(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.map(metaValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function EnquiriesInner() {
  const { canWrite } = usePerm('customers');
  const { values, page, set, setPage, reset } = useUrlFilters({ status: '', type: '' });
  const { data, loading, error, reload, setData } = useApi<Paged<Enquiry>>('/admin/enquiries', { query: { ...values, page, pageSize: 20 } });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(e: Enquiry, status: Enquiry['status']) {
    setBusy(e.id);
    try {
      await api(`/admin/enquiries/${e.id}`, { method: 'PATCH', body: { status } });
      toast.success(`Marked ${titleCase(status).toLowerCase()}`);
      if (values.status && values.status !== status) reload();
      else setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === e.id ? { ...x, status } : x)) } : d));
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Contact form, custom travel, corporate and WhatsApp leads" />
      <Chips
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]}
      />
      <FilterBar onReset={values.type || values.status ? reset : undefined}>
        <FilterSelect value={values.type} onChange={(v) => set({ type: v })} placeholder="All types" options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
      </FilterBar>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState title="Inbox zero" description="No enquiries match these filters." />
      ) : (
        <ul className={clsx('space-y-3', loading && 'opacity-60')}>
          {data.items.map((e) => {
            const expanded = open === e.id;
            const meta = e.meta && typeof e.meta === 'object' ? Object.entries(e.meta) : [];
            return (
              <li key={e.id} className="card overflow-hidden">
                <button type="button" onClick={() => setOpen(expanded ? null : e.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-mist-50" aria-expanded={expanded}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                      {e.name}
                      <span className="rounded bg-mist-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{titleCase(e.type)}</span>
                    </p>
                    <p className={clsx('mt-0.5 text-sm text-slate-600', !expanded && 'line-clamp-1')}>{e.message}</p>
                  </div>
                  <span className="text-xs text-slate-500">{fmtDateTime(e.createdAt)}</span>
                  <EnumBadge value={e.status} tones={ENQUIRY_TONE} />
                  <ChevronDown className={clsx('h-4 w-4 text-slate-400 transition', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="border-t border-mist-100 bg-mist-50/50 px-5 py-4">
                    <p className="whitespace-pre-line text-sm text-slate-700">{e.message}</p>
                    {meta.length > 0 && (
                      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        {meta.map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{titleCase(k.replace(/([a-z])([A-Z])/g, '$1_$2'))}</dt>
                            <dd className="mt-0.5 break-words text-slate-800">{metaValue(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a href={`tel:${e.phone}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-navy-50">
                        <Phone className="h-4 w-4" /> {e.phone}
                      </a>
                      <a href={whatsappLink(e.phone.length === 10 ? `91${e.phone}` : e.phone, `Hello ${e.name}, this is Royal Ride regarding your enquiry.`)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-navy-50">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                      {e.email && (
                        <a href={`mailto:${e.email}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-navy-50">
                          <Mail className="h-4 w-4" /> {e.email}
                        </a>
                      )}
                      {canWrite && (
                        <div className="ml-auto flex gap-1 rounded-xl bg-mist-100 p-1">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={busy === e.id || e.status === s}
                              onClick={() => setStatus(e, s)}
                              className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', e.status === s ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-navy-800')}
                            >
                              {titleCase(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
    </>
  );
}

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EnquiriesInner />
    </Suspense>
  );
}
