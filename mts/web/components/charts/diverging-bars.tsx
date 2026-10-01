'use client';

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtTime } from '@/lib/format';
import { CHROME, DIV } from '@/lib/viz/roles';
import { useCompact } from '@/lib/viz/use-compact';

/**
 * Change against zero — here, how fast the water is rising or falling.
 *
 * "Trending down" is a condition in §7.3 in its own right: it is what starts the
 * staged reinstatement. The level chart shows it only as a gentle curve; this
 * shows it as a sign. Bars above the line are rising (the warm pole), bars
 * below are falling (the cool pole), and the midpoint is nothing at all — not a
 * third colour. The two directions are also labelled, so the chart reads the
 * same without colour.
 */
export function DivergingBars({
  points,
  unit,
  height = 180,
  warnAt,
}: {
  points: { t: number; v: number }[];
  unit: string;
  height?: number;
  /** A rate that deserves attention — drawn as a threshold. */
  warnAt?: number;
}) {
  const compact = useCompact();
  const raw = Math.max(10, ...points.map((p) => Math.abs(p.v)), warnAt ?? 0) * 1.05;
  // A clean, symmetric scale: 0 in the middle, round numbers either side.
  const unitStep = raw > 200 ? 100 : raw > 80 ? 50 : raw > 40 ? 20 : 10;
  const extent = Math.ceil(raw / unitStep) * unitStep;
  const ticks = [-extent, -extent / 2, 0, extent / 2, extent];
  return (
    <div className="min-w-0">
      <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px]" style={{ background: DIV.pos }} aria-hidden /> ▲ rising
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px]" style={{ background: DIV.neg }} aria-hidden /> ▼ falling
        </li>
      </ul>
      <ResponsiveContainer width="100%" height={compact ? Math.round(height * 0.8) : height}>
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: compact ? -10 : -8 }} barCategoryGap={2}>
          <CartesianGrid stroke={CHROME.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t) => fmtTime(t as number)}
            stroke={CHROME.muted}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={compact ? 56 : 40}
          />
          <YAxis stroke={CHROME.muted} fontSize={11} tickLine={false} axisLine={false} width={46} domain={[-extent, extent]} ticks={ticks} tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))} />
          <ReferenceLine y={0} stroke={CHROME.axis} />
          {warnAt ? <ReferenceLine y={warnAt} stroke={CHROME.threshold} strokeDasharray="5 4" /> : null}
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                  <p className="mb-1 text-[11px] text-muted-foreground">{fmtTime(label as number)}</p>
                  <p>
                    <span className="tabular font-semibold">
                      {(payload[0].value as number) > 0 ? '+' : ''}
                      {Math.round(payload[0].value as number)} {unit}
                    </span>{' '}
                    <span className="text-muted-foreground">{(payload[0].value as number) >= 0 ? 'rising' : 'falling'}</span>
                  </p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="v" radius={[3, 3, 3, 3]} maxBarSize={24} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.t} fill={p.v >= 0 ? DIV.pos : DIV.neg} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
