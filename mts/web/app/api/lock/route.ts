import { NextResponse } from 'next/server';
import { GATE_COOKIE } from '@/lib/gate';

/** Forget this browser: the next visit asks for the preview password again. */
export async function POST() {
  // Relative, like the unlock redirect, so it stays on the host the browser used.
  const res = new NextResponse(null, { status: 303, headers: { Location: '/unlock' } });
  res.cookies.set(GATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
