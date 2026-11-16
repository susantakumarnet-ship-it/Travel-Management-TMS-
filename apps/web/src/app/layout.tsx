import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { Providers } from '@/components/layout/Providers';
import { SITE_URL } from '@/lib/server';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Royal Ride – Wedding Cars, Car Rentals & Tours in Odisha', template: '%s | Royal Ride' },
  description:
    'Book decorated wedding cars, luxury vehicles, Tempo Travellers, airport transfers and Odisha tour packages. Verified drivers, transparent pricing, instant confirmation.',
  keywords: ['wedding car rental Bhubaneswar', 'car rental Odisha', 'tempo traveller Bhubaneswar', 'Puri Konark tour package', 'airport taxi Bhubaneswar', 'luxury car hire'],
  openGraph: { type: 'website', siteName: 'Royal Ride', locale: 'en_IN' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#0b1f4b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
