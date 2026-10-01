'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import type { WorkOrder } from '@/lib/api/types';
import { workOrders } from '@/lib/api/endpoints';
import { fmtDateTime, fmtDuration, fmtTime } from '@/lib/format';
import { useDataRevision } from '@/lib/use-data';
import { cn } from '@/lib/utils';

/**
 * §11.2 as a screen: every fault opens a Blue2Care work order, and each one runs
 * against the contractual clocks — response within 6 hours, on-site
 * investigation within 12, repair within 24.
 *
 * The track is the point. Three deadlines on one line, with the moment each step
 * was actually done placed against them, answers "are we inside the contract?"
 * at a glance, and for an open order shows how much of each clock is left. The
 * steps are written in the technician's words because a later reviewer reads
 * them, not the dots.
 */
export function WorkOrdersPanel({ now }: { now: number }) {
  const revision = useDataRevision();
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  /* On the minute, not the 10-minute health cycle: a work order closes the moment
     its "restored" event lands in the alert log, and the two must not disagree. */
  const minute = Math.floor(now / 60_000);

  useEffect(() => {
    workOrders().then(setOrders);
  }, [minute, revision]);

  if (!orders) return null;
  const clocked = orders.flatMap((o) => o.steps.filter((s) => s.dueAt !== undefined && s.doneAt !== undefined));
  const met = clocked.filter((s) => s.doneAt! <= s.dueAt!).length;
  const open = orders.filter((o) => !o.closedAt).length;

  return (
    <section className="rounded-lg border bg-card" aria-labelledby="work-orders">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id="work-orders" className="flex items-center gap-1.5 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden /> Corrective maintenance — response times (§11.2)
          </h2>
          <p className="text-xs text-muted-foreground">
            Blue2Care work orders against the contract: response ≤ 6 h, on-site investigation ≤ 12 h, repair ≤ 24 h.
            A system declared inoperable is repaired within 24 h of remediation starting.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{open} open</span>
          <span className="rounded-full bg-sev-normal-tint px-2 py-0.5 font-medium text-sev-normal-strong">
            {met}/{clocked.length} steps inside the clock
          </span>
        </div>
      </header>

      <ul className="divide-y">
        {orders.map((o) => (
          <Order key={o.id} order={o} now={now} />
        ))}
      </ul>
    </section>
  );
}

function Order({ order: o, now }: { order: WorkOrder; now: number }) {
  const clocked = o.kind === 'fault';
  const end = o.closedAt ?? now;
  /* The track spans the 24-hour clock, or longer when the order ran longer. */
  const span = Math.max(24 * 3_600_000, end - o.raisedAt) * 1.04;
  const x = (t: number) => `${Math.min(100, ((t - o.raisedAt) / span) * 100)}%`;
  const next = o.steps.find((s) => !s.doneAt);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">
            <span className="tabular mr-1.5 text-muted-foreground">{o.id}</span>
            {o.title}
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href={`/stations/${o.locationId}`} className="hover:text-primary hover:underline">
              {o.locationName}
            </Link>{' '}
            · {o.loggerId} · {o.assignee} · raised {fmtDateTime(o.raisedAt)}
            {o.eventId ? (
              <>
                {' '}
                ·{' '}
                <Link href={`/alerts/${o.eventId}`} className="hover:text-primary hover:underline">
                  alert
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {o.closedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-cleared-tint px-2 py-0.5 text-[11px] font-medium text-sev-cleared-strong">
            <span className="h-1.5 w-1.5 rounded-full bg-sev-cleared" aria-hidden /> Closed in {fmtDuration(o.closedAt - o.raisedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warning-tint px-2 py-0.5 text-[11px] font-medium text-sev-warning-strong">
            <span className="h-1.5 w-1.5 rounded-full bg-sev-warning" aria-hidden />
            {next?.dueAt
              ? `${next.label} due in ${fmtDuration(Math.max(0, next.dueAt - now))}`
              : next
                ? `${next.label} planned`
                : 'Awaiting close-out'}
          </span>
        )}
      </div>

      {/* The clock track: elapsed time, the three deadlines, and each step where it happened. */}
      <div className="pt-4" role="img" aria-label={trackLabel(o, now)}>
        <div className="relative h-2 rounded-full bg-muted">
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full', o.closedAt ? 'bg-sev-cleared/40' : 'bg-primary/30')}
            style={{ width: x(end) }}
          />
          {clocked
            ? o.steps.map((s) => (
                <div key={`due-${s.key}`} className="absolute -top-4 bottom-[-4px] w-px bg-threshold/70" style={{ left: x(s.dueAt!) }}>
                  <span
                    className={cn(
                      'tabular absolute -top-0.5 whitespace-nowrap text-[10px] leading-none text-muted-foreground',
                      (s.dueAt! - o.raisedAt) / span > 0.85 ? 'right-1' : 'left-1',
                    )}
                  >
                    {Math.round((s.dueAt! - o.raisedAt) / 3_600_000)} h
                  </span>
                </div>
              ))
            : null}
          {o.steps
            .filter((s) => s.doneAt)
            .map((s) => {
              const late = s.dueAt !== undefined && s.doneAt! > s.dueAt;
              return (
                <span
                  key={`done-${s.key}`}
                  title={`${s.label} — ${fmtTime(s.doneAt!)}`}
                  className={cn(
                    'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card',
                    late ? 'bg-sev-alert' : 'bg-sev-normal',
                  )}
                  style={{ left: x(s.doneAt!) }}
                />
              );
            })}
          {!o.closedAt ? (
            <span className="absolute -bottom-1 -top-1 w-0.5 rounded bg-foreground" style={{ left: x(now) }} title="Now" />
          ) : null}
        </div>
        {!clocked ? (
          <p className="mt-1 text-[10px] text-muted-foreground">Leading indicator — nothing has failed, so no §11.2 clock runs.</p>
        ) : null}
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        {o.steps.map((s) => {
          const late = s.dueAt !== undefined && s.doneAt !== undefined && s.doneAt > s.dueAt;
          return (
            <li key={s.key} className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
              <p className="flex items-center justify-between gap-2 font-medium">
                {s.label}
                {s.doneAt ? (
                  <span className={cn('tabular text-[11px]', late ? 'text-sev-alert-strong' : 'text-sev-normal-strong')}>
                    {fmtDuration(s.doneAt - o.raisedAt)} {s.dueAt ? (late ? '· late' : '· in time') : ''}
                  </span>
                ) : (
                  <span className="tabular text-[11px] text-muted-foreground">
                    {s.dueAt ? `by ${fmtTime(s.dueAt)}` : 'planned'}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-muted-foreground">{s.doneAt ? s.note : 'Not yet done.'}</p>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

function trackLabel(o: WorkOrder, now: number): string {
  const parts = o.steps.map((s) =>
    s.doneAt
      ? `${s.label} done after ${fmtDuration(s.doneAt - o.raisedAt)}${s.dueAt ? (s.doneAt <= s.dueAt ? ', in time' : ', late') : ''}`
      : `${s.label} ${s.dueAt ? `due in ${fmtDuration(Math.max(0, s.dueAt - now))}` : 'planned'}`,
  );
  return `${o.id}: ${parts.join('; ')}.`;
}
