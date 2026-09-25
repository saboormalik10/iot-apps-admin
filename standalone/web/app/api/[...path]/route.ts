import { NextResponse, type NextRequest } from 'next/server';
import { forwardToBackend } from '@/lib/bff/proxy';

/**
 * The generic BFF pass-through (plan §3.1). Every authenticated call the browser
 * makes to `/api/<path>` lands here, gets the access token attached server-side,
 * and is silent-refreshed on 401. The explicit `/api/auth/*` and `/api/ws-ticket`
 * routes sit ABOVE this catch-all (Next resolves specific routes first), so they
 * are not swallowed.
 */
/**
 * A segment must be one plain path segment.
 *
 * Next hands these over DECODED, so `%2e%2e%2f` arrives as `../` and, joined onto
 * the API's `/v1` base, climbed out of it: `/api/x/..%2f..%2fhealth` reached the
 * API's root `/health`, which is meant to be answerable on the station PC only.
 */
function isPlainSegment(segment: string): boolean {
  return segment.length > 0 && segment !== '.' && segment !== '..' && !/[/\\]/.test(segment);
}

async function handler(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  if (!path.every(isPlainSegment)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  return forwardToBackend(request, `/${path.join('/')}`);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
