'use client';

import { CheckCircle2 } from 'lucide-react';
import { LoginFooterLink, PortalLogin } from '@/components/partner/PortalLogin';

export default function PartnerLoginPage() {
  return (
    <PortalLogin
      role="OWNER"
      title="Partner sign in"
      subtitle="Sign in or register your vehicle business with your mobile number."
      aside={
        <div>
          <p className="eyebrow text-gold-300">Royal Ride Partners</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-white">Manage your fleet, bookings and payouts in one place.</h2>
          <ul className="mt-8 space-y-3 text-navy-100">
            {['Accept or decline every booking', 'Assign your own drivers', 'Transparent commission on every trip', 'Bank settlements with statements'].map((x) => (
              <li key={x} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-gold-400" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      }
      footer={
        <>
          New to Royal Ride? <LoginFooterLink href="/partner">Learn about the partner program</LoginFooterLink>
        </>
      }
    />
  );
}
