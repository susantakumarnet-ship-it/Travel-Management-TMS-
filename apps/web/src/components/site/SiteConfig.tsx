'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from '@/lib/types';

import { FALLBACK_CONFIG } from './fallbackConfig';

const Ctx = createContext<SiteConfig>(FALLBACK_CONFIG);

export function SiteConfigProvider({ config, children }: { config: SiteConfig | null; children: ReactNode }) {
  return <Ctx.Provider value={config ?? FALLBACK_CONFIG}>{children}</Ctx.Provider>;
}

export function useSiteConfig() {
  return useContext(Ctx);
}
