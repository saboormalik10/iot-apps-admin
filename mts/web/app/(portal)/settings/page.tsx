'use client';

import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { PREVIEW_EVENT } from '@/components/app-shell/inactivity-warning';
import { Button } from '@/components/ui/button';
import { CHANNELS } from '@/lib/mock/seed/rules';
import { DEMO_USER, ROLES_BY_ID } from '@/lib/mock/seed/people';
import { STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';

/**
 * Your own profile and notification preferences.
 *
 * These belong to the signed-in person, not to the administrator — an admin can
 * edit them on someone's behalf from the Users screen, but the setting is the
 * user's. Hence its own route off the user menu rather than a tab in Administration.
 */
export default function Page() {
  const roles = DEMO_USER.roles.map((r) => ROLES_BY_ID[r]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Your settings</h1>
        <p className="text-sm text-muted-foreground">Your profile, and how you would like to be told about alerts.</p>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Profile</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="font-medium">{DEMO_USER.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="font-medium">{DEMO_USER.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Roles</dt>
            <dd className="flex flex-wrap gap-1 pt-0.5">
              {roles.map((r) => (
                <span key={r.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-strong">
                  {r.name}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Station access</dt>
            <dd className="font-medium">
              {DEMO_USER.stationAccess === 'all'
                ? 'All stations'
                : DEMO_USER.stationAccess.map((s) => STATIONS_BY_ID[s].name).join(', ')}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">How you are notified</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          On-screen alerts always appear while you are signed in. These control what reaches you when you are not.
        </p>
        <ul className="space-y-2">
          {CHANNELS.map((c) => (
            <li
              key={c.id}
              className={cn('flex items-start justify-between gap-3 rounded-md border p-3', !c.available && 'border-dashed bg-muted/40')}
            >
              <div>
                <p className="text-sm font-medium">
                  {c.label}
                  {!c.available ? <span className="ml-2 text-xs font-normal text-muted-foreground">not in scope</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.reason ??
                    (c.id === 'push'
                      ? 'Arrives on your lock screen and opens straight to the event. On iPhone and iPad, add the portal to your Home Screen once to enable it.'
                      : c.id === 'email'
                        ? 'A copy of the alert with the same event and camera links.'
                        : 'Pop-up in the portal, with an audible option for control-room screens.')}
                </p>
              </div>
              <Switch defaultChecked={c.available && c.id !== 'email'} disabled={!c.available} aria-label={c.label} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Security</h2>
        <div className="flex items-center justify-between gap-3 py-2">
          <div>
            <p className="text-sm font-medium">Two-factor authentication</p>
            <p className="text-xs text-muted-foreground">An authenticator app, in addition to your password.</p>
          </div>
          <Button variant="outline" size="sm">Set up</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sessions time out automatically after a period of inactivity, and permissions are re-checked on every action —
          so a role withdrawn takes effect immediately, not at your next sign-in.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => window.dispatchEvent(new Event(PREVIEW_EVENT))}>
          Preview the inactivity warning
        </Button>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Display</h2>
        <p className="text-xs text-muted-foreground">
          How the portal uses colour, and the colour-blind and contrast checks it passes — run live against the theme you
          are using.
        </p>
        <Link href="/design" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
          Colour &amp; chart system →
        </Link>
      </section>
    </div>
  );
}
