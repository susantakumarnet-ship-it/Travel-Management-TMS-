'use client';

import { whatsappLink } from '@/lib/format';
import { useSiteConfig } from './SiteConfig';

export function WhatsAppButton() {
  const { contact } = useSiteConfig();
  if (!contact.whatsapp) return null;
  return (
    <a
      href={whatsappLink(contact.whatsapp, 'Hi Royal Ride, I would like help with a booking.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-lift transition hover:-translate-y-0.5 hover:shadow-xl md:bottom-7 md:right-7"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor" aria-hidden>
        <path d="M16.04 3C8.86 3 3.04 8.82 3.04 16c0 2.3.6 4.53 1.74 6.5L3 29l6.68-1.75A12.94 12.94 0 0 0 16.04 29C23.22 29 29 23.18 29 16S23.22 3 16.04 3Zm0 23.6c-2 0-3.95-.54-5.65-1.56l-.4-.24-3.96 1.04 1.06-3.86-.26-.4A10.56 10.56 0 0 1 5.44 16c0-5.85 4.75-10.6 10.6-10.6 5.84 0 10.56 4.75 10.56 10.6 0 5.84-4.72 10.6-10.56 10.6Zm5.8-7.93c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.72.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.34-.5-2.55-1.58-.94-.84-1.58-1.88-1.77-2.2-.18-.32-.02-.49.14-.65.15-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.53-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.2 2 .12.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
      </svg>
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[160px] md:inline">Chat with us</span>
    </a>
  );
}
