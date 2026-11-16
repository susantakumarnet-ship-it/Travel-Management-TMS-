'use client';

import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useTransition, type ReactNode } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { toQueryString } from './searchParams';

interface Nav {
  params: Record<string, string>;
  pending: boolean;
  /** Merge `patch` into current params (empty string/undefined removes a key) and navigate. */
  update: (patch: Record<string, string | undefined>, opts?: { keepPage?: boolean }) => void;
  replaceAll: (next: Record<string, string>) => void;
}

const Ctx = createContext<Nav | null>(null);

/** URL-bound search state shared by filters, sort, pagination and the results pane. */
export function SearchNavProvider({ params, children }: { params: Record<string, string>; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const go = useCallback(
    (next: Record<string, string>) => {
      start(() => router.push(pathname + toQueryString(next), { scroll: false }));
    },
    [router, pathname],
  );

  const update = useCallback(
    (patch: Record<string, string | undefined>, opts?: { keepPage?: boolean }) => {
      const next: Record<string, string> = { ...params };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete next[k];
        else next[k] = v;
      }
      if (!opts?.keepPage) delete next.page;
      go(next);
    },
    [params, go],
  );

  return <Ctx.Provider value={{ params, pending, update, replaceAll: go }}>{children}</Ctx.Provider>;
}

export function useSearchNav() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSearchNav must be used inside SearchNavProvider');
  return c;
}

export function ResultsPane({ children }: { children: ReactNode }) {
  const { pending } = useSearchNav();
  return (
    <div className="relative" aria-busy={pending}>
      <div className={clsx('transition', pending && 'pointer-events-none opacity-50')}>{children}</div>
      {pending && (
        <div className="absolute inset-x-0 top-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy-900 shadow-lift">
            <Spinner className="h-4 w-4" /> Updating results…
          </span>
        </div>
      )}
    </div>
  );
}

export function SortSelect() {
  const { params, update } = useSearchNav();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-500 sm:inline">Sort by</span>
      <select
        className="input w-auto py-2 pr-8"
        value={params.sort ?? 'recommended'}
        onChange={(e) => update({ sort: e.target.value === 'recommended' ? undefined : e.target.value })}
        aria-label="Sort results"
      >
        <option value="recommended">Recommended</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="rating">Top rated</option>
        <option value="seats">Most seats</option>
      </select>
    </label>
  );
}

export function ResultsPagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { update } = useSearchNav();
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  const goto = (p: number) => {
    update({ page: p === 1 ? undefined : String(p) }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <button className="rounded-lg border border-mist-300 px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => goto(page - 1)}>
        Previous
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-slate-400">…</span>}
          <button
            onClick={() => goto(p)}
            aria-current={p === page ? 'page' : undefined}
            className={clsx('h-10 min-w-10 rounded-lg px-3 text-sm font-semibold', p === page ? 'bg-navy-900 text-white' : 'border border-mist-300 hover:bg-mist-50')}
          >
            {p}
          </button>
        </span>
      ))}
      <button className="rounded-lg border border-mist-300 px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={page >= totalPages} onClick={() => goto(page + 1)}>
        Next
      </button>
    </nav>
  );
}
