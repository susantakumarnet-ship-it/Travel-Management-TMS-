import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '@/lib/auth';
import { AccountNav } from '@/components/site/AccountNav';

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="CUSTOMER">
      <div className="min-h-[70vh] bg-mist-50">
        <AccountNav />
        <div className="container py-8">{children}</div>
      </div>
    </RequireRole>
  );
}
