import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server';
import { fmtDate } from '@/lib/format';
import type { CmsPage } from './siteTypes';
import { Markdown } from './Markdown';

export async function cmsMetadata(slug: string, fallbackTitle: string): Promise<Metadata> {
  const p = await serverApi<CmsPage>(`/public/pages/${slug}`, 300);
  return {
    title: p?.metaTitle ?? p?.title ?? fallbackTitle,
    description: p?.metaDescription ?? `${fallbackTitle} – Royal Ride, Odisha's premium wedding and travel car rental marketplace.`,
    alternates: { canonical: `/${slug}` },
  };
}

export async function CmsPageView({ slug }: { slug: string }) {
  const p = await serverApi<CmsPage>(`/public/pages/${slug}`, 300);
  if (!p) notFound();
  return (
    <>
      <section className="bg-navy-deep">
        <div className="container py-14 md:py-20">
          <p className="eyebrow !text-gold-400">Royal Ride</p>
          <h1 className="mt-3 font-display text-4xl font-semibold !text-white md:text-5xl">{p.title}</h1>
          <p className="mt-3 text-sm text-navy-200">Last updated {fmtDate(p.updatedAt)}</p>
        </div>
      </section>
      <section className="container py-12 md:py-16">
        <article className="mx-auto max-w-3xl">
          <Markdown>{p.body}</Markdown>
        </article>
      </section>
    </>
  );
}
