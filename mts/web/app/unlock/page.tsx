import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { safeNext, sitePassword } from '@/lib/gate';

export const metadata: Metadata = { title: 'Private preview — Sydney Metro M1 portal' };
// Reads the environment and the query on every request.
export const dynamic = 'force-dynamic';

/**
 * The preview gate. Deliberately not styled as the portal's own sign-in screen
 * (that is part of the design under review, at /login): this one belongs to the
 * hosting, and says so.
 */
export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const configured = Boolean(sitePassword());

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold tracking-wide text-wordmark">OBSERVATOR</p>
          <p className="text-xs text-muted-foreground">Weather Monitoring Portal — Sydney Metro M1</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Private preview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the preview password. This browser is remembered for 90 days, so you will only be asked once on this
            machine.
          </p>

          {!configured ? (
            <p role="alert" className="mt-4 rounded-md border border-sev-alert/40 bg-sev-alert-tint p-2 text-sm text-sev-alert-strong">
              No preview password is configured on this server. Set <code>SITE_PASSWORD</code> and redeploy.
            </p>
          ) : (
            <form method="post" action="/api/unlock" className="mt-4 space-y-3">
              <input type="hidden" name="next" value={safeNext(next)} />
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                aria-invalid={error === '1' || undefined}
                aria-describedby={error ? 'unlock-error' : undefined}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error === '1' ? (
                <p id="unlock-error" role="alert" className="text-sm text-sev-alert-strong">
                  That password is not right. Try again.
                </p>
              ) : null}
              <button
                type="submit"
                className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Unlock
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Access control for the hosted prototype only — not part of the portal design under review.
        </p>
      </div>
    </main>
  );
}
