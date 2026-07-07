import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Forgot-password: proxy through. Always neutral ("if the email exists…") — no
 * user enumeration. With email unconfigured the backend returns a `devToken`
 * (dev/CI), which we pass through so the reset E2E journey runs without a mailbox.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const body = await request.text();
  const { res, body: data } = await backendJson<unknown>('/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  // 204 (normal) or 200 { devToken } (dev). Normalize to a neutral 200.
  if (res.status === 204) return NextResponse.json({ data: { ok: true } });
  return NextResponse.json(data ?? { data: { ok: true } }, { status: res.ok ? 200 : res.status });
}
