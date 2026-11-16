'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type RequestOpts } from './api';

/** Fetch data from the API with loading/error state; re-runs when `deps` change. */
export function useApi<T>(path: string | null, opts?: Pick<RequestOpts, 'query'>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const key = JSON.stringify([path, opts?.query]);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path, { query: opts?.query, signal: c.signal });
      if (!c.signal.aborted) setData(d);
    } catch (e) {
      if (!c.signal.aborted && (e as Error).name !== 'AbortError') setError(errorMessage(e));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => {
    void load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Wrap an async action with a pending flag. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      try {
        return await fn(...args);
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
