'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Ban, CircleSlash, Minus, Pause, Zap } from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '@/components/screen-states';
import { roleColor } from '@/components/charts/chart-utils';
import { cn } from '@/lib/utils';
import type { AlertMinuteReason, AlertTimeline, AlertTimelineBucket } from '@/lib/api/types';
import { useAlertTimeline } from './use-alerts';

export const TIMELINE_WINDOWS = [1, 5, 15, 30, 60] as const;
export type TimelineWindow = (typeof TIMELINE_WINDOWS)[number];

export const windowLabel = (m: number) => (m === 60 ? 'Last 1 hour' : `Last ${m} min`);

/**
 * Every minute gets a plain-English verdict. These are the only reasons an
 * armed rule stays quiet, and the two that actually happen — the threshold was
 * never crossed, and a cooldown swallowed the repeat — are indistinguishable
 * from outside the system. Naming them IS the feature.
 */
const REASON: Record<AlertMinuteReason, { label: string; why: string; icon: typeof Zap; tone: string }> = {
  fired: {
    label: 'Fired',
    why: 'Crossed the threshold and raised an alert.',
    icon: Zap,
    tone: 'text-status-error-strong',
  },
  cooldown: {
    label: 'Held (cooldown)',
    why: 'Crossed the threshold, but a recent alert was still inside the cooldown window.',
    icon: Pause,
    tone: 'text-status-warn-strong',
  },
  not_crossed: {
    label: 'Below threshold',
    why: 'The reading never crossed the threshold this minute.',
    icon: Minus,
    tone: 'text-muted-foreground',
  },
  no_data: {
    label: 'No readings',
    why: 'The station sent nothing for this minute, so there was nothing to test.',
    icon: CircleSlash,
    tone: 'text-muted-foreground',
  },
  paused: {
    label: 'Rule paused',
    why: 'The reading crossed the threshold, but the rule is not armed.',
    icon: Ban,
    tone: 'text-muted-foreground',
  },
  not_recorded: {
    label: 'Not recorded',
    why:
      'The stored readings cross the threshold but no alert is logged for this minute — usually a rule ' +
      'that was created, edited or re-armed after these readings arrived.',
    icon: AlertTriangle,
    tone: 'text-status-warn-strong',
  },
};

export const reasonMeta = (r: AlertMinuteReason) => REASON[r] ?? REASON.not_recorded;

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function num(v: number | null, digits = 2): string {
  return v == null ? '–' : v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** The reading the rule tests: the peak for "above" rules, the trough for "below". */
export const peakWord = (condition: string) => (condition === 'gt' || condition === 'gte' ? 'peak' : 'low');

export function RuleTimeline({
  ruleId,
  minutes,
  at,
  enabled = true,
  compact = false,
}: {
  ruleId: string;
  minutes: number;
  /** Centre the window on this instant (a trigger time) instead of ending now. */
  at?: number;
  enabled?: boolean;
  /** Chart only, no table — used inside the notification dialog. */
  compact?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useAlertTimeline(ruleId, minutes, at, enabled);

  if (isLoading) return <LoadingState className="border-0 py-10" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} className="border-0 py-10" />;
  if (!data.supported) {
    return (
      <EmptyState
        title="No measurement stream"
        body="This rule watches an application that no longer stores readings, so there is nothing to reconstruct."
        className="border-0 py-10"
      />
    );
  }

  return <TimelineBody data={data} compact={compact} />;
}

function TimelineBody({ data, compact }: { data: AlertTimeline; compact: boolean }) {
  const unit = data.unit || '';
  const word = peakWord(data.condition);

  const points = useMemo(
    () => data.buckets.map((b) => ({ ts: b.ts, value: b.displayValue, avg: b.displayAvg })),
    [data.buckets],
  );
  const fired = useMemo(() => data.buckets.filter((b) => b.fired), [data.buckets]);
  const withData = data.buckets.filter((b) => b.count > 0).length;

  const counts = useMemo(() => {
    const c = {} as Record<AlertMinuteReason, number>;
    for (const b of data.buckets) c[b.reason] = (c[b.reason] ?? 0) + 1;
    return c;
  }, [data.buckets]);

  return (
    <div className="space-y-4">
      {/* One line that answers the question before any chart is read. */}
      <p className="text-sm">
        {fired.length > 0 ? (
          <>
            <span className="font-medium">
              {fired.length} alert{fired.length === 1 ? '' : 's'}
            </span>{' '}
            in this window.
          </>
        ) : (
          <span className="font-medium">No alerts in this window.</span>
        )}{' '}
        <span className="text-muted-foreground">
          {data.sensor.replace(/_/g, ' ')} {data.condition === 'gt' ? '>' : data.condition === 'gte' ? '≥' : data.condition === 'lt' ? '<' : '≤'}{' '}
          {num(data.threshold)}
          {unit} · cooldown {data.cooldownMinutes} min ·{' '}
          {withData} of {data.buckets.length} minutes had readings
        </span>
      </p>

      <div className="rounded-lg border p-3">
        <ResponsiveContainer width="100%" height={compact ? 180 : 220}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={[data.from, data.to]}
              scale="time"
              tickFormatter={(v) => hhmm(Number(v))}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
              width={44}
              tickFormatter={(v) => num(Number(v), 1)}
              /* The threshold must always be ON the scale. Left to the data the
                 axis stops at the highest reading, so on a quiet window the
                 threshold line falls outside the plot and silently disappears —
                 taking the one reference the chart exists to show. */
              domain={[
                (min: number) => Math.min(min, data.threshold) * (data.threshold < 0 ? 1.1 : 0.9),
                (max: number) => Math.max(max, data.threshold) * 1.1,
              ]}
            />
            {/* The threshold is the whole point of the chart, so it is drawn as
                a labelled rule rather than left to the reader's eye. */}
            <ReferenceLine
              y={data.threshold}
              stroke={roleColor('status-error')}
              strokeDasharray="5 4"
              label={{
                value: `threshold ${num(data.threshold)}${unit}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: roleColor('status-error'),
              }}
            />
            {/* Each alert marked on the axis it was measured on. */}
            {fired.map((b) => (
              <ReferenceLine key={b.ts} x={b.ts} stroke={roleColor('status-error')} strokeWidth={2} />
            ))}
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => hhmm(Number(v))}
              formatter={(v, name) => [
                `${num(typeof v === 'number' ? v : null)}${unit}`,
                name === 'value' ? word : 'average',
              ]}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              dot={false}
              connectNulls={false}
              name="avg"
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={roleColor('chart-1')}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              name="value"
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Thick line is the per-minute {word} — the reading the rule actually tests. Thin line is the minute
          average, for context. Gaps are minutes the station sent nothing.
        </p>
      </div>

      {/* Reason tally — the summary that makes a 60-row table skimmable. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(Object.keys(counts) as AlertMinuteReason[]).map((r) => {
          const meta = reasonMeta(r);
          const Icon = meta.icon;
          return (
            <span key={r} className={cn('inline-flex items-center gap-1.5', meta.tone)} title={meta.why}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {meta.label}
              <span className="text-muted-foreground">· {counts[r]} min</span>
            </span>
          );
        })}
      </div>

      {data.firesOnIngestTime && !compact ? (
        <p className="rounded-md border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs">
          {data.firesOnIngestTime === 1
            ? '1 alert in this window predates the measurement-time record and is plotted'
            : `${data.firesOnIngestTime} alerts in this window predate the measurement-time record and are plotted`}{' '}
          at the moment it was processed, so it may not line up with the readings beneath it. That happens when
          the station is catching up on a backlog — the reading was taken earlier than the alert suggests.
        </p>
      ) : null}
      {!data.historyComplete ? (
        <p className="text-xs text-muted-foreground">
          Only the last 50 alerts are kept, so older minutes in this window may show as “Not recorded”.
        </p>
      ) : null}

      {compact ? null : <MinuteTable buckets={data.buckets} unit={unit} word={word} />}
    </div>
  );
}

function MinuteTable({
  buckets,
  unit,
  word,
}: {
  buckets: AlertTimelineBucket[];
  unit: string;
  word: string;
}) {
  const rows = [...buckets].reverse(); // newest first
  return (
    // A scrollable region needs to be reachable by keyboard, or its rows below
    // the fold are unreachable without a mouse (axe: scrollable-region-focusable).
    <div
      tabIndex={0}
      role="region"
      aria-label="Per-minute readings"
      className="max-h-[320px] overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full text-sm">
        <caption className="sr-only">Per-minute readings and why each minute did or did not raise an alert</caption>
        <thead className="sticky top-0 bg-muted/60 backdrop-blur">
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Minute</th>
            <th scope="col" className="px-3 py-2 font-medium capitalize">{word}</th>
            <th scope="col" className="px-3 py-2 font-medium">Avg</th>
            <th scope="col" className="px-3 py-2 font-medium">Readings</th>
            <th scope="col" className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((b) => {
            const meta = reasonMeta(b.reason);
            const Icon = meta.icon;
            return (
              <tr key={b.ts} className={cn(b.fired && 'bg-status-error/5')}>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{hhmm(b.ts)}</td>
                <td className={cn('px-3 py-1.5 tabular-nums', b.breached && 'font-medium')}>
                  {num(b.displayValue)}
                  {b.displayValue == null ? '' : unit}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{num(b.displayAvg)}</td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{b.count || '–'}</td>
                <td className="px-3 py-1.5">
                  {/* Icon + words, never colour alone. */}
                  <span className={cn('inline-flex items-center gap-1.5', meta.tone)} title={meta.why}>
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {meta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
