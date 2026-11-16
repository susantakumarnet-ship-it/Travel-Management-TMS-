import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { whatsappLink } from '@/lib/format';
import type { SiteConfig } from '@/lib/types';

const COLS: { title: string; links: [string, string][] }[] = [
  {
    title: 'Book',
    links: [
      ['/vehicles', 'All cars'],
      ['/vehicles?purpose=WEDDING', 'Wedding cars'],
      ['/vehicles?category=traveller-group', 'Tempo Travellers'],
      ['/vehicles?purpose=AIRPORT_TRANSFER', 'Airport transfers'],
      ['/packages', 'Tour packages'],
      ['/weddings', 'Wedding packages'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['/about', 'About us'],
      ['/contact', 'Contact'],
      ['/#offers', 'Offers'],
      ['/partner', 'Become a partner'],
      ['/driver/login', 'Driver portal'],
    ],
  },
  {
    title: 'Policies',
    links: [
      ['/terms', 'Terms & conditions'],
      ['/privacy', 'Privacy policy'],
      ['/cancellation-policy', 'Cancellation & refunds'],
    ],
  },
];

export function SiteFooter({ config }: { config: SiteConfig }) {
  const { contact, company } = config;
  return (
    <footer className="bg-navy-deep text-navy-100">
      <div className="container grid grid-cols-1 gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <span className="block h-10 text-lg">
            <Logo dark />
          </span>
          <p className="mt-4 max-w-sm text-sm leading-6 text-navy-200">
            Odisha&apos;s premium marketplace for decorated wedding cars, luxury rides, family tours and airport transfers. Verified partners, professional chauffeurs and transparent pricing.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
              <span>{contact.address}</span>
            </li>
            <li>
              <a href={`tel:${contact.phone}`} className="flex items-center gap-3 hover:text-white">
                <Phone className="h-4 w-4 text-gold-400" /> {contact.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${contact.email}`} className="flex items-center gap-3 hover:text-white">
                <Mail className="h-4 w-4 text-gold-400" /> {contact.email}
              </a>
            </li>
            {contact.whatsapp && (
              <li>
                <a href={whatsappLink(contact.whatsapp, 'Hi Royal Ride, I would like to book a vehicle.')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-white">
                  <MessageCircle className="h-4 w-4 text-gold-400" /> Chat on WhatsApp
                </a>
              </li>
            )}
          </ul>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gold-400">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-navy-200 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-5 text-xs text-navy-300 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {company.name}. All rights reserved.
            {company.gstin && <span className="ml-2">GSTIN {company.gstin}</span>}
          </p>
          <p>Secure payments · Verified partners · 24×7 trip support</p>
        </div>
      </div>
    </footer>
  );
}
