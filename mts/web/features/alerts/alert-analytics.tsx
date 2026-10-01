'use client';

import { useEffect, useState } from 'react';
import type { AlertEvent, Reading, Severity } from '@/lib/api/types';
import { deliveryStats, listEvents } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { RangeBars } from '@/components/charts/range-bars';
import { SeriesChart } from '@/components/charts/series';
import { useDataRevision } from '@/lib/use-data';
import { fmtDay, sydneyMidnight } from '@/lib/format';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { SEVERITY_COLOR } from '@/lib/viz/roles';

/**
 * The log, summarised: how many alerts a day and how serious, and whether they
 * reached people in time. Both cover the last 30 days regardless of the filters
 * below them, and say so — the filters scope the list, these scope the month.
 */
const DAY = 86_400_000;
const ORDER: Severity[] = ['alert', 'warning', 'information', 'cleared'];
const LABEL: Record<Severity, string> = { alert: 'Alert', warning: 'Warning', information: 'Information', cleared: 'Cleared' };

export function AlertAnalytics({ now }: { now: number }) {
  const revision = useDataRevision();
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [delivery, setDelivery] = useState<Awaited<ReturnType<typeof deliveryStats>> | null>(null);
  const hour = Math.floor(now / 3_600_000);

  useEffect(() => {
    if (!now) return;
    listEvents({ withinDays: 30, pageSize: 1000 }).then((p) => setEvents(p.items));
    deliveryStats(30).then(setDelivery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, revision]);

  if (!events || !delivery) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  // Thirty day bins, oldest first; a day with no events is a zero, not a gap.
  const start = sydneyMidnight(now) - 29 * DAY;
  const days = Array.from({ length: 30 }, (_, i) => start + i * DAY);
  const bySeverity = Object.fromEntries(
    ORDER.map((sev) => [
      sev,
      days.map<Reading>((d) => ({
        t: d,
        v: events.filter((e) => e.severity === sev && e.t >= d && e.t < d + DAY).length,
        status: 'normal',
      })),
    ]),
  ) as Record<Severity, Reading[]>;

  const pct = (n: number) => Math.round(n * 1000) / 10;
  const quantile = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0;
  const rows = delivery.map((d) => ({
    label: d.channel === 'screen' ? 'On screen' : d.channel === 'push' ? 'Web push' : 'Email',
    p50: quantile(d.seconds, 0.5),
    p95: quantile(d.seconds, 0.95),
    max: d.seconds[d.seconds.length - 1] ?? 0,
    n: d.total,
    within: d.withinSla,
  }));
  const allWithin = delivery.reduce((a, d) => a + d.withinSla, 0);
  const allTotal = delivery.reduce((a, d) => a + d.total, 0);

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
      <ChartFrame
        as="h2"
        title="Alerts per day — last 30 days"
        footnote="Stacked by severity. Not affected by the filters below."
        table={{
          head: ['Day', ...ORDER.map((s) => LABEL[s]), 'Total'],
          rows: days
            .map((d, i) => [fmtDay(d), ...ORDER.map((s) => bySeverity[s][i].v ?? 0), ORDER.reduce((a, s) => a + (bySeverity[s][i].v ?? 0), 0)])
            .filter((r) => (r[r.length - 1] as number) > 0),
        }}
      >
        <SeriesChart
          height={220}
          xFormat="day"
          series={ORDER.map((sev) => ({
            key: sev,
            label: LABEL[sev],
            points: bySeverity[sev],
            color: SEVERITY_COLOR[sev],
            kind: 'bar' as const,
            stackId: 'day',
          }))}
        />
      </ChartFrame>

      <ChartFrame
        as="h2"
        title="Delivery time — last 30 days"
        footnote={`${pct(allWithin / Math.max(1, allTotal))} % of ${allTotal} deliveries inside the ${THRESHOLDS.deliveryMinutes.weather}-minute weather limit (§7.1). System faults have ${THRESHOLDS.deliveryMinutes.systemFault} minutes.`}
        table={{
          head: ['Channel', 'Median (s)', '95th percentile (s)', 'Slowest (s)', 'In time'],
          rows: rows.map((r) => [r.label, Math.round(r.p50), Math.round(r.p95), Math.round(r.max), `${r.within}/${r.n}`]),
        }}
      >
        <RangeBars rows={rows} slaSeconds={THRESHOLDS.deliveryMinutes.weather * 60} />
        <p className="mt-3 text-[11px] text-muted-foreground">
          SMS is not a channel in this design — Rev B §10 replaces it with web push. Pending MTS confirmation.
        </p>
      </ChartFrame>
    </div>
  );
}
