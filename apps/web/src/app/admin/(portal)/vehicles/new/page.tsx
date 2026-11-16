'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/Display';
import { BackLink, ReadOnlyNotice } from '@/components/admin/bits';
import { usePerm } from '@/components/admin/hooks';
import { VehicleForm } from '@/components/admin/VehicleForm';

export default function NewVehiclePage() {
  const router = useRouter();
  const { canWrite } = usePerm('vehicles');
  return (
    <>
      <PageHeader back={<BackLink href="/admin/vehicles" label="Vehicles" />} title="Add vehicle" subtitle="Vehicles created by an admin go live immediately once a photo is added." />
      {!canWrite && <ReadOnlyNotice module="vehicles" />}
      <VehicleForm
        initial={null}
        create
        disabled={!canWrite}
        submitLabel="Create vehicle"
        onSubmit={async (payload) => {
          const v = await api<{ id: string }>('/admin/vehicles', { method: 'POST', body: payload });
          toast.success('Vehicle created — now add photos');
          router.push(`/admin/vehicles/${v.id}?tab=photos`);
        }}
      />
    </>
  );
}
