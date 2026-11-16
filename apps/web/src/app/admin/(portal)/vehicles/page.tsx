'use client';

import { Suspense } from 'react';
import { AlertTriangle, Plus, Star } from 'lucide-react';
import type { Paged } from '@/lib/types';
import { useApi } from '@/lib/hooks';
import { fmtDate, inr, titleCase } from '@/lib/format';
import { PageHeader } from '@/components/ui/Display';
import { ButtonLink } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Field';
import { VehicleImage } from '@/components/ui/CarArt';
import { DataTable } from '@/components/admin/DataTable';
import { Chips, FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { usePerm, useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, PageSkeleton } from '@/components/admin/bits';
import { VEHICLE_STATUSES, VEHICLE_STATUS_TONE, daysUntil } from '@/components/admin/utils';

interface VehicleRow {
  id: string;
  title: string;
  registrationNumber: string;
  status: string;
  isFeatured: boolean;
  seats: number;
  perDayRate: number;
  perKmRate: number;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  permitExpiry: string | null;
  images: { url: string }[];
  category: { name: string };
  owner: { businessName: string };
  city: { name: string };
  _count: { bookings: number };
}

function earliestExpiry(v: VehicleRow) {
  const all = [
    ['Insurance', v.insuranceExpiry],
    ['Fitness', v.fitnessExpiry],
    ['PUC', v.pollutionExpiry],
    ['Permit', v.permitExpiry],
  ].filter((x): x is [string, string] => !!x[1]);
  all.sort((a, b) => a[1].localeCompare(b[1]));
  return all[0] ?? null;
}

function VehiclesInner() {
  const { canWrite } = usePerm('vehicles');
  const { values, page, set, setPage, reset } = useUrlFilters({ q: '', status: '', categoryId: '', ownerId: '', cityId: '', expiring: '' });
  const { data, loading, error, reload } = useApi<Paged<VehicleRow>>('/admin/vehicles', { query: { ...values, page, pageSize: 20 } });
  const cats = useApi<{ id: string; name: string }[]>('/admin/categories');
  const cities = useApi<{ id: string; name: string }[]>('/admin/cities');
  const owners = useApi<Paged<{ id: string; businessName: string }>>('/admin/owners', { query: { pageSize: 100 } });
  const filtered = Object.values(values).some(Boolean);

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Approve listings, manage pricing, photos, documents and availability"
        actions={
          canWrite && (
            <ButtonLink href="/admin/vehicles/new" icon={<Plus className="h-4 w-4" />}>
              Add vehicle
            </ButtonLink>
          )
        }
      />
      <Chips
        value={values.status}
        onChange={(v) => set({ status: v })}
        options={[{ value: '', label: 'All' }, ...VEHICLE_STATUSES.map((s) => ({ value: s, label: s === 'PENDING_APPROVAL' ? 'Pending approval' : titleCase(s) }))]}
      />
      <FilterBar search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Title or registration" />} onReset={filtered ? reset : undefined}>
        <FilterSelect value={values.categoryId} onChange={(v) => set({ categoryId: v })} placeholder="All categories" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect value={values.ownerId} onChange={(v) => set({ ownerId: v })} placeholder="All owners" options={(owners.data?.items ?? []).map((o) => ({ value: o.id, label: o.businessName }))} />
        <FilterSelect value={values.cityId} onChange={(v) => set({ cityId: v })} placeholder="All cities" options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <div className="flex h-10 items-center rounded-lg border border-mist-300 bg-white px-3">
          <Checkbox label="Documents expiring (30d)" checked={values.expiring === 'true'} onChange={(v) => set({ expiring: v ? 'true' : '' })} />
        </div>
      </FilterBar>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/vehicles/${r.id}`}
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
        empty="No vehicles match these filters"
        columns={[
          {
            key: 'v',
            header: 'Vehicle',
            render: (r) => (
              <div className="flex min-w-[240px] items-center gap-3">
                <VehicleImage src={r.images[0]?.url} alt={r.title} seats={r.seats} className="h-11 w-16 shrink-0 rounded-lg" />
                <Cell
                  primary={
                    <span className="inline-flex items-center gap-1">
                      {r.title}
                      {r.isFeatured && <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" aria-label="Featured" />}
                    </span>
                  }
                  secondary={`${r.registrationNumber} · ${r.category.name}`}
                />
              </div>
            ),
          },
          { key: 'owner', header: 'Owner', render: (r) => r.owner.businessName },
          { key: 'city', header: 'City', render: (r) => r.city.name },
          { key: 'rate', header: 'Rates', align: 'right', render: (r) => <span className="whitespace-nowrap text-xs">{inr(Number(r.perDayRate))}/day · {inr(Number(r.perKmRate))}/km</span> },
          {
            key: 'exp',
            header: 'Next expiry',
            render: (r) => {
              const e = earliestExpiry(r);
              if (!e) return <span className="text-slate-400">—</span>;
              const d = daysUntil(e[1]) ?? 999;
              return (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${d < 0 ? 'font-semibold text-red-600' : d <= 30 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
                  {d <= 30 && <AlertTriangle className="h-3.5 w-3.5" />}
                  {e[0]} · {fmtDate(e[1])}
                </span>
              );
            },
          },
          { key: 'bk', header: 'Bookings', align: 'right', render: (r) => r._count.bookings },
          { key: 'st', header: 'Status', render: (r) => <EnumBadge value={r.status} tones={VEHICLE_STATUS_TONE} label={r.status === 'PENDING_APPROVAL' ? 'Pending approval' : undefined} /> },
        ]}
      />
    </>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VehiclesInner />
    </Suspense>
  );
}
