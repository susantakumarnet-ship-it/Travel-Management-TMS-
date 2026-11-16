'use client';

import { Fragment, Suspense, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/Display';
import { FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { PageSkeleton } from '@/components/admin/bits';
import { useUrlFilters } from '@/components/admin/hooks';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { name: string | null; email: string | null; role: string } | null;
}

const ENTITIES = [
  'Booking',
  'Vehicle',
  'VehicleCategory',
  'VehicleModel',
  'VehicleDocument',
  'VehicleOwner',
  'Driver',
  'User',
  'WeddingRequest',
  'Payment',
  'Refund',
  'OwnerSettlement',
  'Coupon',
  'PricingRule',
  'WeddingPackage',
  'TravelPackage',
  'Page',
  'ContentBlock',
  'Review',
  'Notification',
  'Setting',
  'AdminRole',
  'File',
  'Report',
];

function JsonBox({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="scrollbar-thin max-h-80 overflow-auto rounded-lg border border-mist-200 bg-white p-3 text-[11px] leading-5 text-slate-700">{value == null ? '—' : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function AuditInner() {
  const f = useUrlFilters({ entity: '', action: '' });
  const { data, loading, error, reload } = useApi<Paged<AuditLog>>('/admin/audit-logs', { query: { ...f.values, page: f.page, pageSize: 30 } });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every significant admin action, with before / after snapshots" />
      <FilterBar search={<SearchInput value={f.values.action} onChange={(v) => f.set({ action: v })} placeholder="Action contains… e.g. booking.cancel" />} onReset={f.reset}>
        <FilterSelect value={f.values.entity} onChange={(v) => f.set({ entity: v })} placeholder="All entities" options={ENTITIES.map((e) => ({ value: e, label: e }))} />
      </FilterBar>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="card overflow-hidden">
          <div className="scrollbar-thin overflow-x-auto">
            <table className={`table-base ${loading && data ? 'opacity-60' : ''}`}>
              <thead>
                <tr>
                  <th className="w-8" />
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
                {data?.items.map((l) => {
                  const expandable = l.before != null || l.after != null || !!l.userAgent;
                  const isOpen = open.has(l.id);
                  return (
                    <Fragment key={l.id}>
                      <tr className={expandable ? 'cursor-pointer' : ''} onClick={() => expandable && toggle(l.id)}>
                        <td className="text-slate-400">{expandable && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}</td>
                        <td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</td>
                        <td>
                          {l.actor ? (
                            <div>
                              <p className="font-medium text-navy-900">{l.actor.name ?? l.actor.email ?? '—'}</p>
                              <p className="text-xs text-slate-500">
                                {l.actor.email} · {l.actor.role}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">System</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={/delete|cancel|reject|suspend/.test(l.action) ? 'red' : /create|approve/.test(l.action) ? 'green' : 'navy'} className="font-mono">
                            {l.action}
                          </Badge>
                        </td>
                        <td>
                          <p className="text-sm">{l.entity}</p>
                          {l.entityId && <p className="max-w-[220px] truncate font-mono text-[11px] text-slate-500">{l.entityId}</p>}
                        </td>
                        <td className="whitespace-nowrap font-mono text-xs text-slate-500">{l.ip ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-mist-50 hover:bg-mist-50">
                          <td />
                          <td colSpan={5}>
                            <div className="flex flex-col gap-3 py-1 lg:flex-row">
                              <JsonBox label="Before" value={l.before} />
                              <JsonBox label="After" value={l.after} />
                            </div>
                            {l.userAgent && <p className="mt-2 truncate text-[11px] text-slate-400">{l.userAgent}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && !data.items.length && (
            <div className="p-4">
              <EmptyState title="No audit entries match" />
            </div>
          )}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={f.setPage} />}
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditInner />
    </Suspense>
  );
}
