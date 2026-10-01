'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import type { VigilanceRule, VigilanceStatus } from '@/lib/api/types';
import { getVigilance } from '@/lib/api/endpoints';
import { Meter } from '@/components/charts/meter';
import { VigilanceTimeline } from './vigilance-timeline';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtDuration, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * §7.2, as the server actually runs it: three running totals, each against its
 * line, and a countdown that starts when a total falls back below its line.
 *
 * The client's document explains this as "a tally board" and "a countdown
 * timer" — so that is what is drawn. The meters show how full each tally is; the
 * line under each one says, in words, what the engine is doing about it: over
 * the line, counting down (and until when), or clear. A controller reading
 * "vigilance ends 19:05 unless it rains again" does not need to know the rules.
 */
export function VigilancePanel() {
  const now = useDemoClock();
  const revision = useDataRevision();
  const [data, setData] = useState<VigilanceStatus[] | null>(null);
  const minute = Math.floor(now / 60_000);

  useEffect(() => {
    if (!now) return;
    getVigilance().then(setData);
    // Once a minute is plenty: the tallies are on a five-minute grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, revision]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">Rainfall vigilance</h2>
        <p className="text-xs text-muted-foreground">
          Rolling totals against the three rules of §7.2. Vigilance runs from when a total falls back below its line,
          and restarts if it rains again.
        </p>
      </header>
      {!data ? (
        <div className="h-40 animate-pulse rounded bg-muted/60" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {data.map((g) => (
            <Gauge key={g.locationId} gauge={g} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function Gauge({ gauge, now }: { gauge: VigilanceStatus; now: number }) {
  const worst = gauge.rules.some((r) => r.state === 'breached')
    ? 'breached'
    : gauge.rules.some((r) => r.state === 'vigilance')
      ? 'vigilance'
      : 'clear';
  return (
    <article className="rounded-md border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{gauge.locationName}</h3>
        <StatePill state={worst} />
      </div>
      <div className="space-y-3">
        {gauge.rules.map((r) => (
          <div key={r.id}>
            <Meter label={r.label} sublabel={r.windowLabel} value={r.tallyMm} limit={r.thresholdMm} unit="mm" compact />
            <RuleLine rule={r} now={now} />
          </div>
        ))}
      </div>
      <VigilanceTimeline rules={gauge.rules} now={now} />
    </article>
  );
}

function RuleLine({ rule, now }: { rule: VigilanceRule; now: number }) {
  if (rule.state === 'breached') {
    return (
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Over the line since <span className="tabular font-medium text-foreground">{fmtTime(rule.firstBreachAt!)}</span>. The{' '}
        {rule.vigilanceHours}-hour countdown starts when the total falls below {rule.thresholdMm} mm.
      </p>
    );
  }
  if (rule.state === 'vigilance' && rule.belowAt && rule.endsAt) {
    const elapsed = (now - rule.belowAt) / (rule.endsAt - rule.belowAt);
    return (
      <div className="mt-1">
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-sev-warning" style={{ width: `${Math.min(100, elapsed * 100)}%` }} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3" aria-hidden />
          Vigilance: <span className="tabular font-medium text-foreground">{fmtDuration(rule.endsAt - now)}</span> left · ends{' '}
          {fmtTime(rule.endsAt)}
          {rule.resets ? ` · restarted ${rule.resets}×` : ''}
        </p>
      </div>
    );
  }
  return null;
}

function StatePill({ state }: { state: 'breached' | 'vigilance' | 'clear' }) {
  const Icon = state === 'clear' ? CheckCircle2 : state === 'vigilance' ? Timer : AlertTriangle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        state === 'breached' && 'bg-sev-alert-tint text-sev-alert-strong ring-sev-alert/30',
        state === 'vigilance' && 'bg-sev-warning-tint text-sev-warning-strong ring-sev-warning/30',
        state === 'clear' && 'bg-sev-normal-tint text-sev-normal-strong ring-sev-normal/30',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {state === 'breached' ? 'Over threshold' : state === 'vigilance' ? 'Vigilance' : 'Clear'}
    </span>
  );
}
