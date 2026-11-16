import 'server-only';

/** Server-side fetch for public, SEO-rendered pages. Talks directly to the API. */
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

export async function serverApi<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
