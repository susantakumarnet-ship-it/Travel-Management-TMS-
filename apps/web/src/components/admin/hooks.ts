'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/**
 * List filters kept in the URL (shareable, back-button friendly).
 * Components using this must be rendered inside <Suspense>.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = sp.toString();

  const values = useMemo(() => {
    const out = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const v = sp.get(k);
      if (v != null) out[k] = v;
    }
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);

  const write = useCallback(
    (next: Record<string, string>, nextPage: number) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v !== '' && v !== defaults[k]) p.set(k, v);
      if (nextPage > 1) p.set('page', String(nextPage));
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router],
  );

  const set = useCallback((patch: Partial<T>) => write({ ...values, ...patch } as Record<string, string>, 1), [values, write]);
  const setPage = useCallback((p: number) => write(values as Record<string, string>, p), [values, write]);
  const reset = useCallback(() => write(defaults, 1), [defaults, write]);

  return { values, page, set, setPage, reset };
}

/** Permission helpers for a module: `{ canRead, canWrite }`. */
export function usePerm(module: string) {
  const { hasPermission } = useAuth();
  return { canRead: hasPermission(`${module}:read`), canWrite: hasPermission(`${module}:write`) };
}

/** Simple form state with per-field server validation errors. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k as string]) return e;
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  }, []);
  const reset = useCallback((v?: T) => {
    setForm(v ?? initial);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { form, setForm, set, errors, setErrors, reset };
}
