import type { NextRequest } from 'next/server';
import { forwardToBackend } from '@/lib/bff/proxy';

/**
 * The generic BFF pass-through (plan §3.1). Every authenticated call the browser
 * makes to `/api/<path>` lands here, gets the access token attached server-side,
 * and is silent-refreshed on 401. The explicit `/api/auth/*` and `/api/ws-ticket`
 * routes sit ABOVE this catch-all (Next resolves specific routes first), so they
 * are not swallowed.
 */
async function handler(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  return forwardToBackend(request, `/${path.join('/')}`);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
