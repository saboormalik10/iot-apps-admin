import 'server-only';
import { backendJson } from './backend';

/**
 * Silent refresh. Verified backend behaviour: `/v1/auth/refresh` does NOT rotate
 * — it returns only a new `accessToken` (the refresh token is unchanged). So
 * concurrent refreshes with the same token are idempotent; we still single-flight
 * them so a burst of parallel dashboard 401s shares ONE refresh call rather than a
 * storm. Keyed by refresh token; the entry is cleared once settled.
 */
const inflight = new Map<string, Promise<string>>();

export class RefreshFailedError extends Error {
  constructor(readonly code: string) {
    super(`refresh failed: ${code}`);
    this.name = 'RefreshFailedError';
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const p = (async (): Promise<string> => {
    const { res, body } = await backendJson<{ data?: { accessToken?: string }; error?: { code?: string } }>(
      '/auth/refresh',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
    );

    // A 401 here (INVALID_REFRESH_TOKEN / TOKEN_REVOKED / TOKEN_EXPIRED / user
    // suspended) is unrecoverable → hard logout upstream. Do not loop.
    if (!res.ok || !body?.data?.accessToken) {
      throw new RefreshFailedError(body?.error?.code ?? `HTTP_${res.status}`);
    }
    return body.data.accessToken;
  })();

  inflight.set(refreshToken, p);
  try {
    return await p;
  } finally {
    inflight.delete(refreshToken);
  }
}
