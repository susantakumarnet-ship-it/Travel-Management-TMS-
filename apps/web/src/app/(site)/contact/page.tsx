import type { Metadata } from 'next';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { serverApi } from '@/lib/server';
import type { Category, SiteConfig } from '@/lib/types';
import { whatsappLink } from '@/lib/format';
import { FALLBACK_CONFIG } from '@/components/site/fallbackConfig';
import { EnquiryForm } from '@/components/site/EnquiryForm';

export const metadata: Metadata = {
  title: 'Contact Royal Ride – Wedding cars & car rentals in Odisha',
  description: 'Call, WhatsApp or send an enquiry to the Royal Ride travel desk for wedding cars, tours, airport transfers and corporate travel in Odisha.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const [config, categories] = await Promise.all([serverApi<SiteConfig>('/public/config', 300), serverApi<Category[]>('/public/categories', 300)]);
  const { contact } = config ?? FALLBACK_CONFIG;
  const items = [
    { icon: Phone, label: 'Call us', value: contact.phone, href: `tel:${contact.phone}` },
    { icon: MessageCircle, label: 'WhatsApp', value: 'Chat with our travel desk', href: contact.whatsapp ? whatsappLink(contact.whatsapp, 'Hi Royal Ride, I need help with a booking.') : undefined, external: true },
    { icon: Mail, label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
    { icon: MapPin, label: 'Office', value: contact.address },
    { icon: Clock, label: 'Hours', value: 'Bookings 7 AM – 11 PM · Trip support 24×7' },
  ];
  return (
    <>
      <section className="bg-navy-deep">
        <div className="container py-14 md:py-20">
          <p className="eyebrow !text-gold-400">Contact</p>
          <h1 className="mt-3 font-display text-4xl font-semibold !text-white md:text-5xl">We&apos;re here to help</h1>
          <p className="mt-3 max-w-xl text-navy-100">Questions about a booking, a wedding fleet or a custom tour? Reach our Bhubaneswar travel desk any way you like.</p>
        </div>
      </section>
      <section className="container grid grid-cols-1 gap-10 py-12 md:py-16 lg:grid-cols-[1fr_1.4fr]">
        <ul className="space-y-4">
          {items.map(({ icon: Icon, label, value, href, external }) => {
            const body = (
              <>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                  <span className="block font-medium text-navy-900">{value}</span>
                </span>
              </>
            );
            return (
              <li key={label}>
                {href ? (
                  <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="card flex items-center gap-4 p-4 transition hover:shadow-lift">
                    {body}
                  </a>
                ) : (
                  <div className="card flex items-center gap-4 p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="card p-6 md:p-8">
          <h2 className="font-display text-2xl font-semibold">Send us a message</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">We usually reply within 30 minutes during business hours.</p>
          <EnquiryForm categories={categories ?? []} />
        </div>
      </section>
    </>
  );
}
