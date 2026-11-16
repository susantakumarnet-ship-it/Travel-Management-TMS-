'use client';

import type { ReactNode } from 'react';
import {
  BadgePercent,
  BarChart3,
  Bell,
  CalendarCheck,
  Car,
  CreditCard,
  FileClock,
  Gem,
  Handshake,
  Inbox,
  Layers,
  LayoutDashboard,
  Map as MapIcon,
  PanelsTopLeft,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { RequireRole, useAuth } from '@/lib/auth';
import { PortalShell, type NavGroup } from '@/components/layout/PortalShell';

function AdminShell({ children }: { children: ReactNode }) {
  const { hasPermission: can } = useAuth();
  const nav: NavGroup[] = [
    { items: [{ href: '/admin', label: 'Dashboard', icon: <LayoutDashboard />, show: can('dashboard:read') }] },
    {
      title: 'Operations',
      items: [
        { href: '/admin/bookings', label: 'Bookings', icon: <CalendarCheck />, show: can('bookings:read') },
        { href: '/admin/weddings', label: 'Wedding bookings', icon: <Gem />, show: can('weddings:read') },
        { href: '/admin/enquiries', label: 'Enquiries', icon: <Inbox />, show: can('customers:read') },
      ],
    },
    {
      title: 'Fleet & people',
      items: [
        { href: '/admin/vehicles', label: 'Vehicles', icon: <Car />, show: can('vehicles:read') },
        { href: '/admin/catalog', label: 'Categories & cities', icon: <Layers />, show: can('categories:read') },
        { href: '/admin/owners', label: 'Vehicle owners', icon: <Handshake />, show: can('owners:read') },
        { href: '/admin/drivers', label: 'Drivers', icon: <UserRound />, show: can('drivers:read') },
        { href: '/admin/customers', label: 'Customers', icon: <Users />, show: can('customers:read') },
      ],
    },
    {
      title: 'Finance',
      items: [
        { href: '/admin/payments', label: 'Payments', icon: <CreditCard />, show: can('payments:read') },
        { href: '/admin/refunds', label: 'Refunds', icon: <RotateCcw />, show: can('refunds:read') },
        { href: '/admin/commissions', label: 'Commissions & payouts', icon: <Wallet />, show: can('commissions:read') },
        { href: '/admin/coupons', label: 'Coupons & offers', icon: <BadgePercent />, show: can('coupons:read') },
        { href: '/admin/pricing', label: 'Pricing rules', icon: <SlidersHorizontal />, show: can('settings:read') },
        { href: '/admin/reports', label: 'Reports', icon: <BarChart3 />, show: can('reports:read') },
      ],
    },
    {
      title: 'Content',
      items: [
        { href: '/admin/packages', label: 'Packages', icon: <MapIcon />, show: can('packages:read') },
        { href: '/admin/content', label: 'Website content', icon: <PanelsTopLeft />, show: can('content:read') },
        { href: '/admin/reviews', label: 'Reviews', icon: <Star />, show: can('reviews:read') },
        { href: '/admin/notifications', label: 'Notifications', icon: <Bell />, show: can('notifications:read') },
      ],
    },
    {
      title: 'System',
      items: [
        { href: '/admin/settings', label: 'Settings', icon: <Settings />, show: can('settings:read') },
        { href: '/admin/roles', label: 'Roles & admins', icon: <ShieldCheck />, show: can('roles:read') },
        { href: '/admin/audit', label: 'Audit log', icon: <FileClock />, show: can('audit:read') },
      ],
    },
  ];
  return (
    <PortalShell title="Admin" homeHref="/admin" nav={nav}>
      {children}
    </PortalShell>
  );
}

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="ADMIN">
      <AdminShell>{children}</AdminShell>
    </RequireRole>
  );
}
