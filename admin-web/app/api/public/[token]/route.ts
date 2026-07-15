import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/lib/bff/backend';

/**
 * Public share proxy (plan §Month 11) — the ONE BFF route that carries no session
 * and attaches no token: the shared page is unauthenticated by design. It sits
 * above the generic `/api/[...path]` catch-all (which requires a live session), so
 * an expired/anonymous viewer reaches the backend's rate-limited `/public/:token`
 * without being bounced to login. GET only; the backend enforces expiry/revocation
 * and increments the view counter.
 */
async function handler(_request: NextRequest, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const res = await backendFetch(`/public/${encodeURIComponent(token)}`);
  const headers = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  headers.set('cache-control', 'no-store');
  return new NextResponse(res.body, { status: res.status, headers });
}

export const GET = handler;
export const dynamic = 'force-dynamic';
