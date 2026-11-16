import type { MetadataRoute } from 'next';
import { serverApi, SITE_URL } from '@/lib/server';
import type { Category, Paged, PublicVehicle } from '@/lib/types';
import type { TravelPackage } from '@/components/site/siteTypes';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPaths: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
    ['', 1, 'daily'],
    ['/vehicles', 0.9, 'daily'],
    ['/weddings', 0.9, 'weekly'],
    ['/packages', 0.8, 'weekly'],
    ['/contact', 0.6, 'monthly'],
    ['/about', 0.5, 'monthly'],
    ['/terms', 0.3, 'yearly'],
    ['/privacy', 0.3, 'yearly'],
    ['/cancellation-policy', 0.4, 'yearly'],
  ];

  // Vehicles are paged at 48 per request; fetch up to 20 pages.
  const vehicles: PublicVehicle[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await serverApi<Paged<PublicVehicle>>(`/public/vehicles?pageSize=48&page=${page}`, 3600);
    if (!r) break;
    vehicles.push(...r.items);
    if (page >= r.totalPages) break;
  }
  const [packages, categories] = await Promise.all([serverApi<TravelPackage[]>('/public/travel-packages', 3600), serverApi<Category[]>('/public/categories', 3600)]);

  return [
    ...staticPaths.map(([p, priority, changeFrequency]) => ({ url: `${SITE_URL}${p}`, lastModified: now, priority, changeFrequency })),
    ...(categories ?? []).map((c) => ({ url: `${SITE_URL}/vehicles?category=${c.slug}`, lastModified: now, priority: 0.7, changeFrequency: 'weekly' as const })),
    ...vehicles.map((v) => ({ url: `${SITE_URL}/vehicles/${v.slug}`, lastModified: now, priority: 0.7, changeFrequency: 'weekly' as const })),
    ...(packages ?? []).map((p) => ({ url: `${SITE_URL}/packages/${p.slug}`, lastModified: now, priority: 0.7, changeFrequency: 'monthly' as const })),
  ];
}
