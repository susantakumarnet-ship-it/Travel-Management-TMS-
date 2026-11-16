'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, ChevronDown, Heart, LayoutDashboard, LogOut, Menu, Phone, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, HOME_PATH } from '@/lib/auth';
import { Logo } from '@/components/layout/Logo';
import { useSiteConfig } from './SiteConfig';

const NAV = [
  { href: '/vehicles', label: 'Cars' },
  { href: '/weddings', label: 'Weddings' },
  { href: '/packages', label: 'Tour Packages' },
  { href: '/#offers', label: 'Offers' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const config = useSiteConfig();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  async function doSignOut() {
    await signOut();
    toast.success('Signed out');
    router.push('/');
  }

  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(href + '/'));
  const accountHref = user ? HOME_PATH[user.role] : '/login';
  const firstName = user?.name?.split(' ')[0] ?? 'Account';

  return (
    <header className={clsx('sticky top-0 z-50 border-b transition-all', scrolled ? 'border-mist-200 bg-white/90 shadow-sm backdrop-blur-md' : 'border-transparent bg-white')}>
      <div className="container flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href="/" className="h-9 shrink-0 text-lg md:h-10" aria-label="Royal Ride home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx('relative rounded-lg px-3 py-2 text-sm font-semibold transition', isActive(n.href) ? 'text-navy-900' : 'text-slate-600 hover:text-navy-900')}
            >
              {n.label}
              {isActive(n.href) && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-500" />}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href={`tel:${config.contact.phone}`} className="hidden items-center gap-1.5 text-sm font-semibold text-navy-800 xl:flex">
            <Phone className="h-4 w-4 text-gold-600" />
            {config.contact.phone}
          </a>
          <Link href="/partner" className="hidden rounded-xl border border-gold-300 px-3 py-2 text-sm font-semibold text-gold-800 transition hover:bg-gold-50 md:inline-flex">
            Become a partner
          </Link>
          {loading ? (
            <span className="hidden h-10 w-24 animate-pulse rounded-xl bg-mist-100 md:block" />
          ) : user ? (
            <div className="relative hidden md:block" ref={menuRef}>
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-xl bg-navy-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-navy-800"
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-sheen text-xs font-bold text-navy-950">{firstName.charAt(0).toUpperCase()}</span>
                <span className="max-w-[110px] truncate">{firstName}</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-mist-200 bg-white py-1 shadow-lift animate-fade-up">
                  <div className="border-b border-mist-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-navy-900">{user.name ?? 'Royal Ride member'}</p>
                    <p className="text-xs text-slate-500">+91 {user.phone}</p>
                  </div>
                  {user.role === 'CUSTOMER' ? (
                    <>
                      <MenuLink href="/account" icon={<LayoutDashboard className="h-4 w-4" />}>My account</MenuLink>
                      <MenuLink href="/account/bookings" icon={<CalendarCheck className="h-4 w-4" />}>My bookings</MenuLink>
                      <MenuLink href="/account/weddings" icon={<Heart className="h-4 w-4" />}>Wedding requests</MenuLink>
                      <MenuLink href="/account/profile" icon={<User className="h-4 w-4" />}>Profile & addresses</MenuLink>
                    </>
                  ) : (
                    <MenuLink href={accountHref} icon={<LayoutDashboard className="h-4 w-4" />}>Go to my portal</MenuLink>
                  )}
                  <button onClick={doSignOut} role="menuitem" className="flex w-full items-center gap-3 border-t border-mist-100 px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="hidden rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800 md:inline-flex">
              Sign in
            </Link>
          )}
          <button className="rounded-lg p-2 text-navy-900 hover:bg-mist-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-white shadow-lift animate-fade-up">
            <div className="flex h-16 items-center justify-between border-b border-mist-200 px-4">
              <span className="h-8 text-base"><Logo /></span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-mist-100" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={clsx('block rounded-xl px-4 py-3 text-base font-semibold', isActive(n.href) ? 'bg-navy-50 text-navy-900' : 'text-slate-700 hover:bg-mist-50')}>
                  {n.label}
                </Link>
              ))}
              <Link href="/partner" onClick={() => setOpen(false)} className="mt-2 block rounded-xl px-4 py-3 text-base font-semibold text-gold-700 hover:bg-gold-50">
                Become a partner
              </Link>
              <div className="my-3 border-t border-mist-200" />
              {user ? (
                <>
                  <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Signed in as {user.name ?? `+91 ${user.phone}`}</p>
                  {user.role === 'CUSTOMER' ? (
                    <>
                      <Link href="/account" className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-mist-50">My account</Link>
                      <Link href="/account/bookings" className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-mist-50">My bookings</Link>
                      <Link href="/account/weddings" className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-mist-50">Wedding requests</Link>
                      <Link href="/account/profile" className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-mist-50">Profile & addresses</Link>
                    </>
                  ) : (
                    <Link href={accountHref} className="block rounded-xl px-4 py-3 font-medium text-slate-700 hover:bg-mist-50">Go to my portal</Link>
                  )}
                  <button onClick={doSignOut} className="mt-1 block w-full rounded-xl px-4 py-3 text-left font-medium text-red-600 hover:bg-red-50">Sign out</button>
                </>
              ) : (
                <Link href="/login" className="mx-1 flex justify-center rounded-xl bg-navy-900 px-4 py-3 font-semibold text-white">Sign in / Sign up</Link>
              )}
            </nav>
            <a href={`tel:${config.contact.phone}`} className="flex items-center justify-center gap-2 border-t border-mist-200 py-4 text-sm font-semibold text-navy-800">
              <Phone className="h-4 w-4 text-gold-600" /> {config.contact.phone}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-mist-50 hover:text-navy-900">
      <span className="text-slate-400">{icon}</span>
      {children}
    </Link>
  );
}
