'use client';

import { translator, type Locale, type MessageKey } from '@zopf/shared';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Error code from the API ("another_open", "in_use", ...). */
  error: string | null;
  /** Extra fields of an error answer, e.g. { name } for another_open. */
  details: Record<string, unknown>;
}

/** JSON call to the own API (same domain, the session cookie goes along). */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    if (res.ok) return { ok: true, status: res.status, data: json as T, error: null, details: {} };
    return { ok: false, status: res.status, data: null, error: json?.error ?? 'server_error', details: json ?? {} };
  } catch {
    return { ok: false, status: 0, data: null, error: 'network', details: {} };
  }
}

/** Message for an API error, in the visitor's language. */
export function errorMessage(locale: Locale, result: ApiResult<unknown>): string {
  const t = translator(locale);
  const key = `error.${result.error}` as MessageKey;
  const text = t(key, Object.fromEntries(Object.entries(result.details).map(([k, v]) => [k, String(v)])));
  return text === key ? t('common.error') : text;
}
