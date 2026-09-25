import 'server-only';
import { headers as requestHeaders } from 'next/headers';
import { serverEnv } from '../config/env';

/**
 * The browser's address, as `server.mjs` stamped it (it overwrites anything the
 * browser sent), so the API can rate-limit and audit per PC rather than seeing
 * this app for everyone. Absent outside a request.
 */
async function clientIp(): Promise<string | null> {
  try {
    return (await requestHeaders()).get('x-forwarded-for');
  } catch {
    return null;
  }
}

/**
 * Low-level server → backend fetch. `path` starts with `/` and is appended to
 * BACKEND_URL (which already includes the `/v1` prefix). Never cached.
 */
export async function backendFetch(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const ip = await clientIp();
  if (ip) headers.set('x-forwarded-for', ip);
  return fetch(`${serverEnv.backendUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function backendJson<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<{ res: Response; body: T | undefined }> {
  const res = await backendFetch(path, init, accessToken);
  let body: T | undefined;
  const text = await res.text();
  try {
    body = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    body = undefined;
  }
  return { res, body };
}
