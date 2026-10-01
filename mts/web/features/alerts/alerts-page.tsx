'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Download } from 'lucide-react';
import type { AlertEvent, LocationId, Severity } from '@/lib/api/types';
import {
  acknowledgeAll,
  acknowledgeEvent,
  activeAlertCount,
  listEvents,
  unacknowledgedCount,
} from '@/lib/api/endpoints';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { StatusPill, severityTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import { PtzDialog } from '@/features/alerts/ptz-dialog';
import { AlertAnalytics } from './alert-analytics';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';

/**
 * Every event the system has raised, and what was done about it.
 *
 * Acknowledgement is the point of the screen: an alert nobody owns is an alert
 * nobody is acting on, so an unacknowledged row keeps its button and an
 * acknowledged one shows who took it and when. That record is what the audit trail
 * and any post-incident review are built from.
 *
 * The four tiles read the whole log, not the filtered page — "3 active alerts" has
 * to mean three on the corridor, not three that happen to match the filter — so
 * they come from the same counters the header chip uses and move with it.
 */

const FILTERS: { id: Severity | 'all' | 'unack'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'alert', label: 'Alert' },
  { id: 'warning', label: 'Warning' },
  { id: 'information', label: 'Information' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'unack', label: 'Unacknowledged' },
];

const RANGES = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 0, label: 'All time' },
];

const PAGE_STEP = 25;

export function AlertsPage() {
  const now = useDemoClock();
  const revision = useDataRevision();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [locationId, setLocationId] = useState<LocationId | 'all'>('all');
  const [days, setDays] = useState(7);
  const [shown, setShown] = useState(PAGE_STEP);
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [camera, setCamera] = useState<AlertEvent | null>(null);

  const load = useCallback(() => {
    listEvents({
      severity: filter === 'unack' || filter === 'all' ? 'all' : filter,
      unacknowledgedOnly: filter === 'unack',
      locationId,
      withinDays: days || undefined,
      pageSize: shown,
    })
      .then((page) => {
        setEvents(page.items);
        setTotal(page.total);
      })
      .catch(() => setError(true));
  }, [filter, locationId, days, shown]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [load, revision]);

  /* Reading the counters here — rather than counting the rows on screen — is what
     keeps this number and the header's the same number. `revision` is in the
     dependency list so an acknowledgement moves both at once. */
  const unack = unacknowledgedCount();
  const counts = {
    active: activeAlertCount(),
    unack,
    today: events === null ? null : events.filter((e) => e.t >= now - 86_400_000).length,
    range: total,
  };
  void revision;

  const changeFilter = (next: (typeof FILTERS)[number]['id']) => {
    setFilter(next);
    setShown(PAGE_STEP);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alerts &amp; notifications</h1>
          <p className="text-sm text-muted-foreground">
            Every event the system has generated. Filter, review and acknowledge.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={unack === 0}
            onClick={() => acknowledgeAll().then(load)}
          >
            <Check className="h-4 w-4" /> Mark all acknowledged
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv(events ?? [])}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active alerts" value={counts.active} tone="alert" />
        <Kpi label="Unacknowledged" value={counts.unack} tone="warning" />
        <Kpi label="In the last 24 hours" value={counts.today} tone="info" />
        <Kpi label="Matching these filters" value={counts.range} tone="info" />
      </div>

      <AlertAnalytics now={now} />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setShown(PAGE_STEP);
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none"
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value as LocationId | 'all');
              setShown(PAGE_STEP);
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none"
            aria-label="Location"
          >
            <option value="all">All locations</option>
            {STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Event log — {total} {total === 1 ? 'event' : 'events'} · newest first
          </h2>
        </header>

        {error ? (
          <ErrorState onRetry={load} />
        ) : !events ? (
          <LoadingState label="Loading events…" />
        ) : events.length === 0 ? (
          <EmptyState title="Nothing matches those filters" body="Widen the severity, the date range or the location." />
        ) : (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3 hover:bg-muted/40">
                {/* Below `sm` this becomes a stack: at 375 px a three-column row
                    squeezed the title to about 40 px and wrapped it one word per
                    line, with the timestamp sitting on top of it. */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                    {/* A fixed width, so titles all start at the same x however
                        wide the severity word is. */}
                    <StatusPill tone={severityTone(e.severity)} size="sm" className="mt-0.5 shrink-0 justify-center self-start sm:w-[104px]" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/alerts/${e.id}`}
                        className="block text-sm font-medium hover:text-primary hover:underline"
                      >
                        {e.message}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{e.locationName}</span>
                        <span aria-hidden>·</span>
                        <span className="capitalize">{e.category}</span>
                        <span aria-hidden>·</span>
                        <span>{e.track === 'both' ? 'Both tracks' : `${e.track === 'up' ? 'Up' : 'Down'} track`}</span>
                        {e.draftWording ? (
                          <span className="rounded bg-muted px-1.5 text-[11px] uppercase">draft wording</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                    {e.cameraUrl ? (
                      <Button size="sm" variant="outline" onClick={() => setCamera(e)}>
                        <Camera className="h-3.5 w-3.5" /> PTZ
                      </Button>
                    ) : null}
                    <time
                      className="tabular whitespace-nowrap text-muted-foreground"
                      dateTime={new Date(e.t).toISOString()}
                    >
                      {fmtDateTime(e.t)}
                    </time>
                    {e.autoCleared ? (
                      <span className="whitespace-nowrap rounded bg-sev-cleared-tint px-2 py-1 text-sev-cleared-strong">
                        auto-cleared
                      </span>
                    ) : e.acknowledgement ? (
                      <span className="tabular whitespace-nowrap text-sev-normal-strong">
                        ✓ ack {initials(e.acknowledgement.by)} {fmtTime(e.acknowledgement.at)}
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => acknowledgeEvent(e.id).then(load)}>
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Showing {events?.length ?? 0} of {total} · all events are retained and exportable.
          </span>
          {events && events.length < total ? (
            <Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE_STEP)}>
              Load {Math.min(PAGE_STEP, total - events.length)} more
            </Button>
          ) : null}
        </footer>
      </section>

      <PtzDialog event={camera} onClose={() => setCamera(null)} onAcknowledge={(id) => acknowledgeEvent(id).then(load)} />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p, i) => (i === 0 ? `${p[0]}.` : p))
    .join(' ');
}

/** The demo's CSV: the rows on screen, exactly as they read. */
function exportCsv(events: AlertEvent[]): void {
  const head = ['Time', 'Severity', 'Category', 'Location', 'Track', 'Message', 'Acknowledged by', 'Acknowledged at'];
  const rows = events.map((e) => [
    new Date(e.t).toISOString(),
    e.severity,
    e.category,
    e.locationName,
    e.track,
    e.message,
    e.acknowledgement?.by ?? '',
    e.acknowledgement ? new Date(e.acknowledgement.at).toISOString() : '',
  ]);
  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mts-alerts-demo.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, tone }: { label: string; value: number | null; tone: 'alert' | 'warning' | 'info' }) {
  return (
    <div
      className={cn(
        'rounded-lg border-l-4 bg-card p-3 shadow-sm ring-1 ring-border',
        tone === 'alert' && 'border-l-sev-alert',
        tone === 'warning' && 'border-l-sev-warning',
        tone === 'info' && 'border-l-sev-info',
      )}
    >
      {/* A dash while loading, not a zero: "0 active alerts" is a statement, and
          for a second and a half it was the wrong one. */}
      <p className="tabular text-2xl font-semibold">{value === null ? '–' : value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
