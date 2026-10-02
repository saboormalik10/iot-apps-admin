'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Turnstile } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERRORS: Record<string, string> = {
  credentials: 'That email and password do not match. Check them and try again.',
  human: 'The security check did not pass. Try it again.',
  config: 'Sign-in is not configured on this server: set SITE_EMAIL and SITE_PASSWORD.',
};

/**
 * Sign in: email, password, the Cloudflare check. A plain form post to
 * /api/login — the server checks the details and sets the session.
 */
export function LoginForm() {
  const params = useSearchParams();
  const [human, setHuman] = useState(false);
  const signedOut = params.get('signed-out') === '1';
  const error = params.get('error');
  const next = params.get('next') ?? '/';

  return (
    <form method="post" action="/api/login" className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {signedOut && !error ? (
        <p role="status" className="rounded-md border border-sev-normal/40 bg-sev-normal-tint p-2 text-sm text-sev-normal-strong">
          You have signed out. Sign in again to continue.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-sev-alert/40 bg-sev-alert-tint p-2 text-sm text-sev-alert-strong">
          {ERRORS[error] ?? ERRORS.credentials}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" defaultValue={params.get('email') ?? ''} autoFocus={!params.get('email')} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" autoFocus={Boolean(params.get('email'))} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border" />
        Keep me signed in on this device for 30 days
      </label>
      <Turnstile action="login" onVerify={(t) => setHuman(Boolean(t))} />
      <Button type="submit" className="w-full" disabled={!human}>
        {human ? 'Sign in' : 'Complete the check to sign in'}
      </Button>
      <p className="text-center text-xs">
        <Link href="/locked" className="text-muted-foreground hover:underline">
          See the lockout screen
        </Link>
      </p>
    </form>
  );
}
