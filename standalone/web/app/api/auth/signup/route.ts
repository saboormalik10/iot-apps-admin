import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Create your own account — proxied through. The API refuses (404) unless the site
 * turned sign-up on, and answers the same whether or not the email is taken.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }
  const { res, body } = await backendJson<unknown>('/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await request.text(),
  });
  const out = NextResponse.json(body ?? { data: { status: 'pending' } }, { status: res.status });
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) out.headers.set('retry-after', retryAfter);
  return out;
}
