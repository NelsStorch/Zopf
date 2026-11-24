import 'server-only';
import { cookies } from 'next/headers';

/**
 * Calls the backend from a server component. Goes through the private Docker
 * network (INTERNAL_API_URL) and passes the visitor's cookies along, so an
 * admin session works on the server side too.
 */
export async function serverApi<T>(path: string): Promise<{ status: number; data: T | null }> {
  const base = (process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${base}${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: 'no-store',
    });
    const data = res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as T) : null;
    return { status: res.status, data };
  } catch {
    return { status: 503, data: null };
  }
}
