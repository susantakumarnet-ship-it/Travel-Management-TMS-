/**
 * Browser API client.
 *  - Access token lives in memory only (XSS can't read it from storage).
 *  - Refresh token is an httpOnly cookie scoped to /api/auth (same-origin via Next rewrites).
 *  - On 401, one silent refresh is attempted, then the request is retried.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** Field errors from zod's flatten() → { field: "message" } */
  get fieldErrors(): Record<string, string> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return Object.fromEntries(Object.entries(d?.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0] ?? '']));
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(t: string | null) {
  accessToken = t;
  listeners.forEach((l) => l(t));
}
export function getAccessToken() {
  return accessToken;
}
export function onTokenChange(fn: (token: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshSession(): Promise<{ accessToken: string; user: unknown } | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) {
    setAccessToken(null);
    return null;
  }
  const data = await res.json();
  setAccessToken(data.accessToken);
  return data;
}

async function tryRefresh(): Promise<boolean> {
  refreshing ??= refreshSession()
    .then((d) => !!d)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;
export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Body;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Return the raw Response (e.g. for file downloads). */
  raw?: boolean;
}

export function buildQuery(q?: RequestOpts['query']) {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}, retried = false): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isForm && opts.body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    signal: opts.signal,
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, opts, true);
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res as unknown as T;
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.message ?? `Request failed (${res.status})`, e.code, e.details);
  }
  return data as T;
}

/** Download an authenticated file (PDF/CSV/XLSX) and save it. */
export async function downloadFile(path: string, query?: RequestOpts['query'], fallbackName = 'download') {
  const res = await api<Response>(path, { query, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open an authenticated file (e.g. admin viewing a private KYC document) in a new tab. */
export async function openFile(path: string, query?: RequestOpts['query']) {
  const res = await api<Response>(path, { query, raw: true });
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
