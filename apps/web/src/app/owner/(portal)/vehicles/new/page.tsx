'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/Display';
import { VehicleForm } from '@/components/partner/VehicleForm';

export default function NewVehiclePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={
          <Link href="/owner/vehicles" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900">
            <ArrowLeft className="h-4 w-4" /> Vehicles
          </Link>
        }
        title="Add a vehicle"
        subtitle="After saving you can upload photos and documents. Our team reviews every new vehicle before it goes live."
      />
      <VehicleForm onSaved={(v) => router.replace(`/owner/vehicles/${v.id}?tab=photos`)} />
    </div>
  );
}
