import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/gate';

/** Sign out: the session ends and the next visit asks for the email and password again. */
export async function POST() {
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login?signed-out=1' } });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
