'use client';

import type { ReactNode } from 'react';
import { RequireRole } from '@/lib/auth';
import { SetupShell } from '@/components/partner/common';

export default function DriverSetupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="DRIVER">
      <SetupShell label="Driver onboarding">{children}</SetupShell>
    </RequireRole>
  );
}
