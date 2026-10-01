import type { ReactNode } from 'react';

/**
 * The sign-in surface. None of these screens is specified in the client's
 * documents — they are promised in prose ("a secure invitation to set their own
 * password", "optional multi-factor authentication", "account lockout") — so this
 * is our proposal and should be reviewed as such.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="bg-banner px-4 py-1 text-center text-[11px] font-medium text-banner-foreground">
        Design prototype — demonstration data only.
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="text-lg font-bold tracking-wide text-wordmark">OBSERVATOR</p>
            <p className="text-xs text-muted-foreground">Weather Monitoring Portal — Sydney Metro M1</p>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
