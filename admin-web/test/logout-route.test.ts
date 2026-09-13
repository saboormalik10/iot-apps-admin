import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Signing out must not wait on the backend.
 *
 * The route used to `await` the upstream token revocation before clearing the
 * cookie, so signing out took as long as a round trip to Render and Atlas —
 * measured at 4,803ms — while the user stared at a page they had just asked to
 * leave. Clearing the cookie is what signs them out of this browser, and it is
 * local and instant.
 *
 * The revocation still has to happen; it is what invalidates the refresh token
 * everywhere else. So the property under test is not "it is skipped" but "it is
 * off the path the user waits on" — which is why `backendFetch` here returns a
 * promise that NEVER resolves. If the route awaits it, this test hangs.
 */

const destroy = vi.fn();
const backendFetch = vi.fn();
const afterCallbacks: (() => unknown)[] = [];

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    // Capture rather than run, so the test can assert WHEN it runs.
    after: (cb: () => unknown) => afterCallbacks.push(cb),
  };
});
vi.mock('@/lib/bff/backend', () => ({ backendFetch: (...a: unknown[]) => backendFetch(...a) }));
vi.mock('@/lib/session', () => ({
  getSession: async () => ({ refreshToken: 'refresh-abc', accessToken: 'access-abc', destroy }),
}));
vi.mock('@/lib/bff/csrf', () => ({ isCsrfSafe: () => true }));

const { POST } = await import('@/app/api/auth/logout/route');

const request = () => new Request('http://localhost/api/auth/logout', { method: 'POST' }) as never;

beforeEach(() => {
  destroy.mockReset();
  backendFetch.mockReset().mockImplementation(() => new Promise(() => {}));
  afterCallbacks.length = 0;
});

describe('POST /api/auth/logout', () => {
  it('responds without waiting for the upstream revocation', async () => {
    // `backendFetch` never settles. Awaiting it would hang this test.
    const res = await POST(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { ok: true } });
  });

  it('clears the session, and does so BEFORE responding', async () => {
    await POST(request());
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still schedules the revocation — it is not dropped', async () => {
    await POST(request());
    expect(afterCallbacks).toHaveLength(1);

    // Not called during the request…
    expect(backendFetch).not.toHaveBeenCalled();
    // …and called once the scheduled work runs.
    void afterCallbacks[0]();
    expect(backendFetch).toHaveBeenCalledTimes(1);
    expect(backendFetch.mock.calls[0][0]).toBe('/auth/logout');
    expect(String(backendFetch.mock.calls[0][1].body)).toContain('refresh-abc');
  });

  it('a failing revocation cannot break the sign-out', async () => {
    backendFetch.mockRejectedValue(new Error('upstream down'));
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(destroy).toHaveBeenCalled();
    await expect(afterCallbacks[0]()).resolves.not.toThrow();
  });

  it('refuses a request that fails the CSRF check', async () => {
    vi.doMock('@/lib/bff/csrf', () => ({ isCsrfSafe: () => false }));
    vi.resetModules();
    const { POST: guarded } = await import('@/app/api/auth/logout/route');
    const res = await guarded(request());
    expect(res.status).toBe(403);
  });
});
