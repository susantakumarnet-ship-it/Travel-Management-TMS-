import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { serverApi } from '@/lib/server';
import type { Category, City, TravelPurpose } from '@/lib/types';
import { PURPOSE_LABEL } from '@/lib/format';
import type { SearchResult } from '@/components/site/siteTypes';
import { flatParams, journeyQuery, toQueryString, type ParamRecord } from '@/components/site/searchParams';
import { VehicleCard } from '@/components/site/VehicleCard';
import { ResultsPagination, ResultsPane, SearchNavProvider, SortSelect } from '@/components/site/SearchNav';
import { JourneyBar, VehicleFilters } from '@/components/site/VehicleFilters';

type Props = { searchParams: Promise<ParamRecord> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = flatParams(await searchParams);
  const cats = await serverApi<Category[]>('/public/categories', 300);
  const cat = cats?.find((c) => c.slug === p.category);
  const purpose = p.purpose ? PURPOSE_LABEL[p.purpose as TravelPurpose] : null;
  const title = cat ? `${cat.name} on rent in Odisha` : purpose ? `${purpose} cars on rent in Odisha` : 'Cars, SUVs & Tempo Travellers on rent in Odisha';
  return {
    title,
    description: `${cat?.description ?? 'Compare verified cars, SUVs, luxury and wedding vehicles'} — live availability, transparent per-km and per-day pricing, professional drivers. Book online with Royal Ride.`,
    alternates: { canonical: cat ? `/vehicles?category=${cat.slug}` : '/vehicles' },
  };
}

export default async function VehiclesPage({ searchParams }: Props) {
  const params = flatParams(await searchParams);
  const apiQuery = { ...params, pageSize: params.pageSize ?? '12' };
  const [result, categories, cities] = await Promise.all([
    serverApi<SearchResult>(`/public/vehicles${toQueryString(apiQuery)}`, 0),
    serverApi<Category[]>('/public/categories', 300),
    serverApi<City[]>('/public/cities', 300),
  ]);
  const cats = categories ?? [];
  const jq = journeyQuery({ ...params, ...(result?.estimatedKm && !params.estimatedKm ? { estimatedKm: String(result.estimatedKm) } : {}) });
  const activeCat = cats.find((c) => c.slug === params.category);

  return (
    <SearchNavProvider params={params}>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="container py-8 md:py-10">
          <nav className="text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:underline">Home</Link> <span aria-hidden>/</span> <span className="text-navy-900">Cars</span>
          </nav>
          <h1 className="mt-2 font-display text-3xl font-semibold md:text-4xl">{activeCat ? activeCat.name : 'Find your perfect ride'}</h1>
          <p className="mt-1 text-sm text-slate-600">{activeCat?.description ?? 'Verified vehicles with professional drivers across Odisha.'}</p>
        </div>
      </section>

      <div className="container py-8">
        <JourneyBar categories={cats} />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <VehicleFilters categories={cats} cities={cities ?? []} />
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600" aria-live="polite">
                {result ? (
                  <>
                    <span className="font-bold text-navy-900">{result.total}</span> vehicle{result.total === 1 ? '' : 's'} found
                    {params.pickupAt && params.returnAt && ' for your dates'}
                    {result.estimatedKm > 0 && <span className="text-slate-400"> · estimate based on ~{result.estimatedKm} km</span>}
                  </>
                ) : (
                  'Search results'
                )}
              </p>
              <div className="flex items-center gap-2">
                <SortSelect />
              </div>
            </div>
            <ResultsPane>
              {!result ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                  We couldn&apos;t load vehicles right now. Please check your dates (return must be after pickup) or try again in a moment.
                </div>
              ) : result.items.length === 0 ? (
                <div className="flex flex-col items-center rounded-3xl border border-dashed border-mist-300 bg-mist-50 px-6 py-16 text-center">
                  <SearchX className="h-10 w-10 text-navy-300" />
                  <p className="mt-3 font-semibold text-navy-900">No vehicles match your search</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">Try different dates, fewer filters or another category. Our travel desk can also arrange a vehicle for you.</p>
                  <div className="mt-5 flex gap-3">
                    <Link href="/vehicles" className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white">Clear all filters</Link>
                    <Link href="/contact" className="rounded-xl border border-mist-300 px-4 py-2 text-sm font-semibold text-navy-900">Ask our team</Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {result.items.map((v) => (
                      <VehicleCard key={v.id} v={v} query={jq} />
                    ))}
                  </div>
                  <ResultsPagination page={result.page} totalPages={result.totalPages} />
                </>
              )}
            </ResultsPane>
          </div>
        </div>
      </div>
    </SearchNavProvider>
  );
}
