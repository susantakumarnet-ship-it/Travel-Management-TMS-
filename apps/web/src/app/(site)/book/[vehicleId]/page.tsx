import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { CheckoutFlow } from '@/components/site/CheckoutFlow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function BookPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner className="h-8 w-8 text-navy-700" />
        </div>
      }
    >
      <CheckoutFlow vehicleId={vehicleId} />
    </Suspense>
  );
}
