import { ApiError } from './errors';

/**
 * Browser → BFF HTTP client. It targets the BFF route handlers under `/api/**`,
 * NEVER the backend directly — the BFF attaches the access token server-side and
 * silent-refreshes on 401, so the browser never sees a token. All calls are
 * same-origin (the session cookie rides along).
 */
const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      // CSRF signal: same-origin fetches carry these; the BFF re-checks them.
      'x-requested-with': 'fetch',
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw await ApiError.fromResponse(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Unwrap the `{ data: T }` success envelope. */
function unwrap<T>(body: { data: T } | T): T {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const http = {
  get: async <T>(path: string, signal?: AbortSignal): Promise<T> =>
    unwrap<T>(await request<{ data: T } | T>('GET', path, undefined, signal)),
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap<T>(await request<{ data: T } | T>('POST', path, body)),
  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    unwrap<T>(await request<{ data: T } | T>('PATCH', path, body)),
  delete: async <T>(path: string): Promise<T> =>
    unwrap<T>(await request<{ data: T } | T>('DELETE', path)),
  /** Raw variant for list endpoints that need `pagination`/`unreadCount` siblings. */
  getRaw: <T>(path: string, signal?: AbortSignal): Promise<T> => request<T>('GET', path, undefined, signal),
};
