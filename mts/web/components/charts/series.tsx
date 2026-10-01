'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Cell,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ParameterId, Reading } from '@/lib/api/types';
import { fmtDateTime, fmtDay, fmtTime, fmtValue, sydneyMidnight } from '@/lib/format';
import { CHROME, PARAM_COLOR } from '@/lib/viz/roles';
import { useCompact } from '@/lib/viz/use-compact';

/**
 * The shared chart body.
 *
 * Two rules hold the visual language together across every screen:
 *
 *   • a parameter always has the same colour — rainfall is rainfall on the trends
 *     screen, the flood screen and a station card — so `PARAM_ROLE` maps parameter
 *     to token rather than cycling a palette by series index; and
 *   • a threshold is not a series. It is the rule the series is judged against, so
 *     it is always dashed, always labelled with its value, and drawn in the
 *     threshold token — with the critical "block the line" level in alert red and
 *     working set points in a quieter neutral, exactly as the client's Figure 8
 *     distinguishes rail foot from pump start.
 */

/** Kept as an alias: the roles themselves live in lib/viz/roles.ts. */
export const PARAM_ROLE: Record<ParameterId, string> = PARAM_COLOR;

export interface ThresholdMark {
  value: number;
  label: string;
  /** `critical` draws in alert red; a working set point stays neutral. */
  tone?: 'critical' | 'setpoint';
}

export interface BandMark {
  from: number;
  to: number;
  label?: string;
  tone?: 'warning' | 'alert';
}

export interface SeriesSpec {
  key: string;
  label: string;
  points: Reading[];
  parameter?: ParameterId;
  color?: string;
  /** Gust sits on the same chart as mean: same hue family, dashed, so it separates
      without a second colour that would fail under protanopia. */
  dashed?: boolean;
  kind?: 'line' | 'area' | 'bar';
  /** Bars over their threshold turn red, as the rainfall mockup shows. */
  alertAbove?: number;
  /** Bars sharing a stack id sit on top of each other (part-to-whole per day). */
  stackId?: string;
}

interface Props {
  series: SeriesSpec[];
  thresholds?: ThresholdMark[];
  bands?: BandMark[];
  height?: number;
  yLabel?: string;
  domain?: [number | 'auto', number | 'auto'];
  /** Two or more series always carry a key; one does not need one. */
  legend?: boolean;
  /** An axis of clock times, or of days. */
  xFormat?: 'time' | 'day';
  /**
   * Moments on the time axis — "duty pump started", "rail foot reached" — drawn
   * as labelled vertical rules, the way the client's Figure 12 marks the pump
   * start on the level trend. A reading next to the event that explains it.
   */
  markers?: { t: number; label: string; tone?: 'alert' | 'info' }[];
  /** Charts sharing an id share a crosshair: hover one, read them all. */
  syncId?: string;
  /** Said over the plot when there is no data at all in the window. */
  emptyText?: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** A 0-based axis to a round top, in four or five round steps. */
function niceAxis(max: number): { top: number; ticks: number[] } {
  const rough = Math.max(max, 1) / 5;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= rough) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}

/**
 * Clean ticks on a real time axis: on the hour, on the half hour, at midnight —
 * in Sydney time, the clock every label is printed in. Category axes labelled
 * whatever sample happened to land under them ("14:37", "25 Sept 25 Sept").
 */
function timeTicks(from: number, to: number, maxTicks: number): number[] {
  const span = to - from;
  const steps = [10 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 2 * 24 * HOUR, 7 * 24 * HOUR];
  const step = steps.find((x) => span / x <= maxTicks) ?? steps[steps.length - 1];
  const origin = sydneyMidnight(from);
  const ticks: number[] = [];
  for (let t = origin; t <= to; t += step) if (t >= from) ticks.push(t);
  return ticks;
}

/**
 * A threshold's label, drawn at the right-hand end on its own plate.
 *
 * Sitting at the top left it landed on whatever the series was doing there —
 * "rail foot 200 mm (block line)" was struck through by the curve on every
 * screenshot. The plate keeps it legible wherever the line happens to run.
 */
function thresholdLabel(text: string, color: string, side: 'left' | 'right' = 'right') {
  function Label({ viewBox }: { viewBox?: { x: number; y: number; width: number; height: number } }) {
    const box = viewBox ?? { x: 0, y: 0, width: 0, height: 0 };
    const w = text.length * 5.1 + 10;
    const right = side === 'right' ? box.x + box.width - 3 : box.x + w + 13;
    return (
      <g>
        <rect
          x={right - w - 10}
          y={box.y - 14}
          width={w + 10}
          height={13}
          rx={3}
          fill="hsl(var(--card))"
          fillOpacity={0.94}
          stroke={color}
          strokeOpacity={0.45}
        />
        {/* A dash of the rule's own colour keys the plate to its line; the words
            themselves stay in ink, because red 10 px text on a card fails AA. */}
        <line x1={right - w - 6} x2={right - w + 2} y1={box.y - 7.5} y2={box.y - 7.5} stroke={color} strokeWidth={2} />
        <text x={right - 5} y={box.y - 4} textAnchor="end" fontSize={10} fontWeight={500} fill={CHROME.ink}>
          {text}
        </text>
      </g>
    );
  }
  return Label;
}

/**
 * The hover readout. Values lead and names follow — the reader already knows
 * which line they pointed at and wants the number — and each row is keyed with a
 * short stroke of the series colour, not a filled box.
 */
function Readout({
  active,
  payload,
  label,
  specs,
  xFormat,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | null }[];
  label?: number;
  specs: SeriesSpec[];
  xFormat?: 'time' | 'day' | 'datetime';
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 text-[11px] text-muted-foreground">{label ? (xFormat === 'day' ? fmtDay(label) : xFormat === 'datetime' ? fmtDateTime(label) : fmtTime(label)) : ''}</p>
      <ul className="space-y-0.5">
        {payload.map((row) => {
          const spec = specs.find((s) => s.key === row.dataKey);
          if (!spec) return null;
          const color = spec.color ?? (spec.parameter ? PARAM_COLOR[spec.parameter] : CHROME.ink);
          return (
            <li key={String(row.dataKey)} className="flex items-center gap-2">
              <svg width="12" height="6" aria-hidden>
                <line x1="0" y1="3" x2="12" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray={spec.dashed ? '3 2' : undefined} />
              </svg>
              <span className="tabular font-semibold">{fmtValue(row.value ?? null)}</span>
              <span className="text-muted-foreground">{spec.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SeriesChart({
  series,
  thresholds = [],
  bands = [],
  height = 220,
  domain,
  legend,
  xFormat = 'time',
  markers = [],
  syncId,
  emptyText,
}: Props) {
  const compact = useCompact();
  const plotHeight = compact ? Math.round(height * 0.78) : height;
  /**
   * The y-axis always reaches the rule.
   *
   * Recharts scales to the data, so on a quiet day a "≥ 25 mm/hr" line sat off
   * the top of the chart and simply vanished — leaving a chart that looked as
   * though nothing had a threshold at all. Including it in the domain keeps the
   * reading and the rule in the same picture, which is the entire point.
   */
  const thresholdMax = thresholds.length ? Math.max(...thresholds.map((t) => t.value)) : undefined;
  /* Round ends and round steps: an axis reading "0 60 120 230" makes the eye
     do arithmetic. The top clears both the rule and the data. */
  const dataMax = Math.max(0, ...series.filter((s) => !s.stackId).flatMap((s) => s.points.map((p) => p.v ?? 0)));
  const niceY = !domain && thresholdMax !== undefined ? niceAxis(Math.max(thresholdMax * 1.15, dataMax * 1.05)) : undefined;
  const autoDomain: [number | 'auto', number | 'auto'] | undefined = domain ?? (niceY ? [0, niceY.top] : undefined);
  const data = series[0]?.points.map((p, i) => {
    const row: Record<string, number | null> = { t: p.t };
    series.forEach((s) => {
      row[s.key] = s.points[i]?.v ?? null;
    });
    return row;
  });

  const showLegend = legend ?? series.length > 1;

  /* Bars need a category axis (one band per bin). Lines and areas get a true
     time axis, so markers, bands and ticks sit at their real times. */
  const hasBars = series.some((x) => x.kind === 'bar');
  const first = data?.[0]?.t ?? 0;
  const last = data?.[data.length - 1]?.t ?? 0;
  const ticks = hasBars ? undefined : timeTicks(first, last, compact ? 4 : 8);
  const multiDay = last - first > 30 * HOUR;
  const tickFmt = (t: number) => (xFormat === 'day' || (multiDay && sydneyMidnight(t) === t) ? fmtDay(t) : fmtTime(t));
  const lastIndex = (data?.length ?? 1) - 1;

  /**
   * Which end of the chart each threshold's plate goes to: whichever end its line
   * is NOT being crossed by data. A rising storm runs straight through a plate
   * parked at the right edge; a receding one through a plate at the left.
   */
  const top = typeof autoDomain?.[1] === 'number' ? autoDomain[1] : Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.v ?? 0)));
  const plateSide = (value: number): 'left' | 'right' => {
    const near = (from: number, to: number) =>
      series.some((s) => {
        const pts = s.points.slice(Math.floor(s.points.length * from), Math.ceil(s.points.length * to));
        return pts.some((p) => p.v !== null && Math.abs(p.v - value) / top < 0.07);
      });
    return near(0.8, 1) && !near(0, 0.25) ? 'left' : 'right';
  };

  return (
    <div className="min-w-0">
      {showLegend ? (
        <ul className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
          {series.map((s) => {
            const color = s.color ?? (s.parameter ? PARAM_ROLE[s.parameter] : 'hsl(var(--chart-1))');
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                {/* The key mirrors the mark: a block for a bar or area, a stroke for a line. */}
                {s.kind === 'bar' ? (
                  <span className="h-2.5 w-3 rounded-[2px]" style={{ background: color }} aria-hidden />
                ) : (
                  <svg width="18" height="8" aria-hidden>
                    <line
                      x1="0"
                      y1="4"
                      x2="18"
                      y2="4"
                      stroke={color}
                      strokeWidth="2.5"
                      strokeDasharray={s.dashed ? '4 3' : undefined}
                    />
                  </svg>
                )}
                {s.label}
              </li>
            );
          })}
          {thresholds.length ? (
            <li className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden>
                <line x1="0" y1="4" x2="18" y2="4" stroke={CHROME.threshold} strokeWidth="1.5" strokeDasharray="5 4" />
              </svg>
              threshold
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="relative">
      {series.every((x) => x.points.every((p) => p.v === null)) ? (
        /* No readings in the window is information, not a blank chart. */
        <p className="absolute inset-x-8 top-1/2 z-10 -translate-y-1/2 rounded-md border bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm">
          {emptyText ?? 'No readings in this period.'}
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={plotHeight}>
      <ComposedChart
        data={data}
        syncId={syncId}
        /* By time, not by index: charts on a page sample at different rates,
           and index-syncing would line up 13:00 on one with 14:00 on another. */
        syncMethod="value"
        margin={{ top: 14, right: 12, bottom: 4, left: compact ? -10 : -8 }}
        barCategoryGap={hasBars ? '12%' : undefined}
        barGap={2}
      >
        <CartesianGrid stroke={CHROME.grid} vertical={false} />
        <XAxis
          dataKey="t"
          {...(hasBars
            ? { minTickGap: compact ? 56 : 40 }
            : { type: 'number' as const, scale: 'time' as const, domain: [first, last], ticks, interval: 0 })}
          tickFormatter={(t) => (hasBars ? (xFormat === 'day' ? fmtDay(t as number) : fmtTime(t as number)) : tickFmt(t as number))}
          stroke={CHROME.muted}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: CHROME.axis }}
        />
        <YAxis
          stroke={CHROME.muted}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={46}
          domain={autoDomain ?? ['auto', 'auto']}
          ticks={niceY?.ticks}
        />

        {bands.map((b, i) => (
          <ReferenceArea
            key={`band-${i}`}
            x1={b.from}
            x2={b.to}
            fill={b.tone === 'alert' ? 'hsl(var(--band-alert))' : 'hsl(var(--band-warning))'}
            fillOpacity={0.55}
            label={b.label ? { value: b.label, position: 'insideTop', fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : undefined}
          />
        ))}

        {thresholds.map((th) => (
          <ReferenceLine
            key={th.label}
            y={th.value}
            stroke={th.tone === 'critical' ? 'hsl(var(--threshold))' : 'hsl(var(--threshold-soft))'}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={thresholdLabel(
              th.label,
              th.tone === 'critical' ? 'hsl(var(--threshold))' : 'hsl(var(--threshold-soft))',
              plateSide(th.value),
            )}
          />
        ))}

        {markers
          .filter((m) => m.t >= first && m.t <= last)
          .sort((a, b) => a.t - b.t)
          .map((m, i) => (
            <ReferenceLine
              key={`m-${m.t}-${m.label}`}
              x={m.t}
              stroke={m.tone === 'alert' ? 'hsl(var(--sev-alert))' : CHROME.muted}
              strokeWidth={1}
              strokeOpacity={0.8}
              /* Alternate rows, so two events a few minutes apart do not print
                 their labels on top of each other. Near the right edge the
                 label reads leftwards from its rule, or it is cut off. */
              label={{
                value: m.label,
                position: (m.t - first) / Math.max(1, last - first) > 0.82 ? 'insideTopRight' : 'insideTopLeft',
                fontSize: 10,
                fill: CHROME.ink,
                offset: i % 2 ? 20 : 6,
              }}
            />
          ))}

        {series.map((s) => {
          const color = s.color ?? (s.parameter ? PARAM_ROLE[s.parameter] : 'hsl(var(--chart-1))');
          /* The latest reading gets a dot, ringed in the surface colour so it
             stays legible where it crosses a threshold — the "now" mark the
             client's Figures 7 and 12 put at the end of every trend. */
          const endDot = (props: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
            // An area's value is [base, value]; a missing reading must not get a dot.
            const v = Array.isArray(props.value) ? props.value[1] : props.value;
            return props.index === lastIndex && props.cx !== undefined && props.cy !== undefined && typeof v === 'number' ? (
              <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={color} stroke={CHROME.surface} strokeWidth={2} />
            ) : (
              <g key={`d-${props.index}`} />
            );
          };
          if (s.kind === 'bar') {
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color}
                stackId={s.stackId}
                /* In a stack only the top segment is rounded, and every segment
                   is parted from the next by the surface colour — a gap, not an
                   outline. */
                radius={s.stackId && s !== lastInStack(series, s.stackId) ? 0 : [4, 4, 0, 0]}
                stroke={s.stackId ? CHROME.surface : undefined}
                strokeWidth={s.stackId ? 1.5 : 0}
                maxBarSize={24}
                isAnimationActive={false}
              >
                {s.alertAbove !== undefined
                  ? data?.map((row, i) => (
                      <Cell
                        key={i}
                        fill={(row[s.key] ?? 0) >= s.alertAbove! ? 'hsl(var(--sev-alert))' : color}
                      />
                    ))
                  : null}
              </Bar>
            );
          }
          if (s.kind === 'area') {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                fill={color}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={endDot}
                activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
          }
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              dot={endDot}
              activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          );
        })}

        <Tooltip
          cursor={{ stroke: CHROME.axis, strokeWidth: 1 }}
          content={<Readout specs={series} xFormat={xFormat === 'day' && hasBars ? 'day' : multiDay ? 'datetime' : 'time'} />}
        />
      </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function lastInStack(series: SeriesSpec[], stackId: string): SeriesSpec | undefined {
  return [...series].reverse().find((x) => x.stackId === stackId);
}

/** The trail on a live reading card — same data as the big number beside it. */
export function Sparkline({ points, parameter, tone }: { points: Reading[]; parameter?: ParameterId; tone?: 'alert' | 'warning' }) {
  const color = tone === 'alert' ? 'hsl(var(--sev-alert))' : tone === 'warning' ? 'hsl(var(--sev-warning))' : parameter ? PARAM_ROLE[parameter] : 'hsl(var(--chart-1))';
  const values = points.map((p) => p.v ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * w;
      const y = h - ((p.v ?? min) - min) / span * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
