'use client';

import type { ReactNode } from 'react';
import { RequireRole } from '@/lib/auth';
import { SetupShell } from '@/components/partner/common';

export default function OwnerSetupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="OWNER">
      <SetupShell label="Partner onboarding">{children}</SetupShell>
    </RequireRole>
  );
}
