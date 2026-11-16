'use client';

import { CheckCircle2 } from 'lucide-react';
import { LoginFooterLink, PortalLogin } from '@/components/partner/PortalLogin';

export default function DriverLoginPage() {
  return (
    <PortalLogin
      role="DRIVER"
      title="Driver sign in"
      subtitle="Use your mobile number to sign in or join as a Royal Ride driver."
      aside={
        <div>
          <p className="eyebrow text-gold-300">Royal Ride Drivers</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-white">Your trips, routes and earnings — right on your phone.</h2>
          <ul className="mt-8 space-y-3 text-navy-100">
            {['Get trip assignments instantly', 'One-tap navigation to pickup', 'Record odometer, tolls & parking', 'Track your earnings'].map((x) => (
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
          Own vehicles? <LoginFooterLink href="/partner">Become a vehicle partner</LoginFooterLink>
        </>
      }
    />
  );
}
