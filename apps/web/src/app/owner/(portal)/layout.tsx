'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarCheck, CarFront, IndianRupee, LayoutDashboard, Star, UserCircle, Users } from 'lucide-react';
import { RequireRole, useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { PortalShell, type NavGroup } from '@/components/layout/PortalShell';
import { Spinner } from '@/components/ui/Spinner';
import { Banner } from '@/components/partner/common';

function OwnerPortal({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const owner = user?.owner;
  const pending = useApi<Paged<unknown>>(owner ? '/owner/bookings' : null, { query: { scope: 'pending', pageSize: 1 } }, [pathname]);

  useEffect(() => {
    if (user && !owner) router.replace('/owner/onboarding');
  }, [user, owner, router]);

  if (!owner) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-navy-700" />
      </div>
    );
  }

  const nav: NavGroup[] = [
    {
      items: [
        { href: '/owner', label: 'Dashboard', icon: <LayoutDashboard /> },
        { href: '/owner/bookings', label: 'Bookings', icon: <CalendarCheck />, badge: pending.data?.total },
        { href: '/owner/vehicles', label: 'Vehicles', icon: <CarFront /> },
        { href: '/owner/drivers', label: 'Fleet drivers', icon: <Users /> },
      ],
    },
    {
      title: 'Business',
      items: [
        { href: '/owner/earnings', label: 'Earnings & payouts', icon: <IndianRupee /> },
        { href: '/owner/reviews', label: 'Reviews', icon: <Star /> },
        { href: '/owner/profile', label: 'Business profile', icon: <UserCircle /> },
      ],
    },
  ];

  return (
    <PortalShell title="Partner" nav={nav} homeHref="/owner">
      {owner.kycStatus === 'PENDING' && (
        <Banner
          tone="amber"
          title="Your KYC is under review"
          action={
            pathname !== '/owner/profile' ? (
              <Link href="/owner/profile" className="text-sm font-semibold underline">
                View documents
              </Link>
            ) : undefined
          }
        >
          Bookings can&apos;t reach you until our team approves your business documents. Make sure your PAN, Aadhaar and bank proof are uploaded — you can add vehicles in the meantime.
        </Banner>
      )}
      {owner.kycStatus === 'REJECTED' && (
        <Banner
          tone="red"
          title="Your KYC was not approved"
          action={
            pathname !== '/owner/profile' ? (
              <Link href="/owner/profile" className="text-sm font-semibold underline">
                Fix & re-upload
              </Link>
            ) : undefined
          }
        >
          Your vehicles are hidden from customers. Review the note on your business profile, update your details or re-upload the documents.
        </Banner>
      )}
      {children}
    </PortalShell>
  );
}

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="OWNER">
      <OwnerPortal>{children}</OwnerPortal>
    </RequireRole>
  );
}
