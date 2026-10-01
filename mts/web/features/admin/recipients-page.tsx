'use client';

import { CHANNELS } from '@/lib/mock/seed/rules';
import { RECIPIENT_GROUPS } from '@/lib/mock/seed/people';
import { cn } from '@/lib/utils';

/**
 * Who hears about what, and how.
 *
 * Rev B lists recipients alongside thresholds and wording as something MTS
 * administers, and §13 asks MTS for the list — so this screen is where that answer
 * lands. The channel row is deliberately explicit about SMS being out of scope
 * rather than silently omitting it.
 */
export function RecipientsPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Named groups receive alerts by the channels enabled here. Individual notification preferences sit on each
        person&apos;s own profile.
      </p>

      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recipient groups</h2>
        </header>
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted">
              <tr>
                {['Group', 'Members', 'Purpose', 'Channels'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECIPIENT_GROUPS.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{g.label}</td>
                  <td className="tabular px-3 py-2 text-muted-foreground">{g.members}</td>
                  <td className="px-3 py-2 text-muted-foreground">{g.description}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {CHANNELS.filter((c) => c.available).map((c) => (
                        <span key={c.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary-strong">
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Delivery channels</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-md border p-3',
                !c.available && 'border-dashed bg-muted/40 text-muted-foreground',
              )}
            >
              <p className="text-sm font-medium">
                {c.label}
                {!c.available ? <span className="ml-2 text-xs font-normal">not in scope</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.reason ??
                  (c.id === 'push'
                    ? 'Delivered whether or not the portal is open. On iPhone and iPad the portal must be added to the Home Screen once.'
                    : c.id === 'screen'
                      ? 'Pop-up and unacknowledged badge, with an audible option for control-room use.'
                      : 'Carries the same event link as the on-screen alert.')}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
