import type { ReactNode } from 'react';
import { serverApi } from '@/lib/server';
import type { SiteConfig } from '@/lib/types';
import { SiteConfigProvider } from '@/components/site/SiteConfig';
import { FALLBACK_CONFIG } from '@/components/site/fallbackConfig';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const config = (await serverApi<SiteConfig>('/public/config', 300)) ?? FALLBACK_CONFIG;
  return (
    <SiteConfigProvider config={config}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter config={config} />
      <WhatsAppButton />
    </SiteConfigProvider>
  );
}
