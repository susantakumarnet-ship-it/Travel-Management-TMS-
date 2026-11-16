'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CarFront, Fuel, Plus, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { FUEL_LABEL, inr } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Select } from '@/components/ui/Field';
import { VehicleImage } from '@/components/ui/CarArt';
import { VehicleStatusBadge } from '@/components/partner/common';
import type { OwnerVehicle, VehicleStatus } from '@/components/partner/types';

export default function OwnerVehiclesPage() {
  const { data, error, loading, reload, setData } = useApi<OwnerVehicle[]>('/owner/vehicles');
  const [busy, setBusy] = useState<string | null>(null);

  async function changeStatus(v: OwnerVehicle, status: VehicleStatus) {
    setBusy(v.id);
    try {
      await api(`/owner/vehicles/${v.id}/status`, { method: 'PATCH', body: { status } });
      setData((list) => list?.map((x) => (x.id === v.id ? { ...x, status } : x)) ?? null);
      toast.success(`${v.title} is now ${status.toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vehicles"
        subtitle="Your fleet listings. New vehicles go live after admin approval."
        actions={
          <ButtonLink href="/owner/vehicles/new" variant="gold" icon={<Plus className="h-4 w-4" />}>
            Add vehicle
          </ButtonLink>
        }
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="Add your first vehicle with photos, pricing and documents to start receiving bookings."
          icon={<CarFront className="h-6 w-6" />}
          action={
            <ButtonLink href="/owner/vehicles/new" variant="gold" icon={<Plus className="h-4 w-4" />}>
              Add vehicle
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((v) => {
            const editable = v.status !== 'PENDING_APPROVAL' && v.status !== 'REJECTED';
            const primary = v.images.find((i) => i.isPrimary) ?? v.images[0];
            return (
              <div key={v.id} className="card flex flex-col overflow-hidden">
                <Link href={`/owner/vehicles/${v.id}`} className="relative block aspect-[16/10] bg-mist-100">
                  <VehicleImage src={primary?.url} alt={v.title} categorySlug={v.category?.slug} seats={v.seats} className="h-full w-full" />
                  <span className="absolute left-3 top-3">
                    <VehicleStatusBadge status={v.status} />
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-md bg-navy-950/80 px-2 py-0.5 font-mono text-xs font-semibold text-white">{v.registrationNumber}</span>
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <Link href={`/owner/vehicles/${v.id}`} className="font-semibold text-navy-900 hover:underline">
                    {v.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {v.category?.name} · {v.city?.name} · {v.year}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {v.seats} seats
                    </span>
                    <span className="flex items-center gap-1">
                      <Fuel className="h-3.5 w-3.5" /> {FUEL_LABEL[v.fuelType] ?? v.fuelType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-semibold text-navy-900">{inr(v.perDayRate)}</span>/day · <span className="font-semibold text-navy-900">{inr(v.perKmRate)}</span>/km
                  </p>
                  {v.statusNote && <p className="mt-2 rounded-lg bg-mist-50 px-2 py-1 text-xs text-slate-600">{v.statusNote}</p>}
                  <div className="mt-auto flex items-center gap-2 pt-4">
                    {editable ? (
                      <Select
                        aria-label="Change availability status"
                        value={v.status}
                        disabled={busy === v.id}
                        onChange={(e) => changeStatus(v, e.target.value as VehicleStatus)}
                        className="h-9 py-1.5 text-sm"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="MAINTENANCE">Maintenance</option>
                      </Select>
                    ) : (
                      <span className="flex-1 text-xs text-slate-500">{v.status === 'REJECTED' ? 'Update details and contact support' : 'Waiting for admin approval'}</span>
                    )}
                    <ButtonLink href={`/owner/vehicles/${v.id}`} variant="outline" size="sm">
                      Manage
                    </ButtonLink>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
