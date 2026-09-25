import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isCsrfSafe } from '@/lib/bff/csrf';

const forwardToBackend = vi.fn();
vi.mock('@/lib/bff/proxy', () => ({ forwardToBackend: (...a: unknown[]) => forwardToBackend(...a) }));

/**
 * Two guards on the way into the portal's API, both found wanting in the 23 Sep
 * security review.
 */

const req = (method: string, headers: Record<string, string>) =>
  new NextRequest(new Request('http://station-pc:3201/api/users/me', { method, headers }));

describe('CSRF check', () => {
  it('lets a same-origin mutation through', () => {
    expect(isCsrfSafe(req('PATCH', { origin: 'http://station-pc:3201', host: 'station-pc:3201', 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('refuses a mutation from another origin', () => {
    expect(isCsrfSafe(req('POST', { origin: 'http://evil.example', host: 'station-pc:3201', 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  // The hole: `Sec-Fetch-Site: none` was believed on its own, so a request whose
  // Origin plainly disagreed was accepted.
  it('refuses a mismatched Origin however the request labels itself', () => {
    expect(isCsrfSafe(req('PATCH', { origin: 'http://evil.example', host: 'station-pc:3201', 'sec-fetch-site': 'none' }))).toBe(false);
    expect(isCsrfSafe(req('DELETE', { origin: 'http://evil.example', host: 'station-pc:3201', 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });

  it('refuses a mutation that carries no origin at all', () => {
    expect(isCsrfSafe(req('POST', { host: 'station-pc:3201' }))).toBe(false);
  });

  it('leaves reads alone', () => {
    expect(isCsrfSafe(req('GET', { origin: 'http://evil.example', host: 'station-pc:3201' }))).toBe(true);
  });
});

describe('the portal\'s API path', () => {
  beforeEach(() => {
    forwardToBackend.mockReset().mockResolvedValue(new Response('ok'));
  });

  const call = async (segments: string[]) => {
    const { GET } = await import('@/app/api/[...path]/route');
    return GET(req('GET', { host: 'station-pc:3201' }), { params: Promise.resolve({ path: segments }) });
  };

  it('passes an ordinary path to the API', async () => {
    const res = await call(['devices']);
    expect(res.status).toBe(200);
    expect(forwardToBackend).toHaveBeenCalledWith(expect.anything(), '/devices');
  });

  // Next decodes the segments, so "%2e%2e%2f" arrived as "../" and climbed out of
  // the API's /v1 base to its root routes (/health, /version).
  it('refuses a path that climbs out of the API', async () => {
    for (const segments of [['x', '..', '..', 'health'], ['..', 'version'], ['x', '../..', 'health'], ['.']]) {
      const res = await call(segments);
      expect(res.status).toBe(404);
    }
    expect(forwardToBackend).not.toHaveBeenCalled();
  });
});
