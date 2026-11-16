'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, HOME_PATH } from '@/lib/auth';
import { OtpLogin } from '@/components/ui/OtpLogin';
import { Spinner } from '@/components/ui/Spinner';

/** Customer login; already-signed-in users are sent on to `next` or their home. Must be inside <Suspense>. */
export function CustomerLogin() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  useEffect(() => {
    if (!loading && user) router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : HOME_PATH[user.role]);
  }, [user, loading, next, router]);

  if (loading || user) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="h-6 w-6 text-navy-700" />
      </div>
    );
  }
  return <OtpLogin role="CUSTOMER" />;
}
