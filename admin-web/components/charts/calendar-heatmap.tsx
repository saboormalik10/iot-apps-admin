'use client';

import { Card } from '@/components/ui/card';
import { cssVar, type PaletteRole } from '@/lib/api/scales';

const DAY_MS = 86_400_000;

export interface CalendarCell {
  dateMs: number;
  value: number | null;
}

/**
 * CalendarHeatmap — a GitHub-style day grid, single-hue sequential by magnitude
 * (plan §14). Days inside the covered span that carry no value are flagged as
 * gaps (status-error, low opacity) so missing data reads as missing, never as
 * zero (§10.2). Generic over the metric: pass a `max` + `formatValue` to control
 * normalisation and the tooltip.
 */
export function CalendarHeatmap({
  cells,
  title,
  subtitle,
  role = 'seq-4',
  max,
  formatValue = (v) => String(Math.round(v)),
  legendLess = 'Less',
  legendMore = 'More',
}: {
  cells: CalendarCell[];
  title: string;
  subtitle?: string;
  role?: PaletteRole;
  max?: number;
  formatValue?: (v: number) => string;
  legendLess?: string;
  legendMore?: string;
}) {
  if (!cells.length) return null;

  const sorted = [...cells].sort((a, b) => a.dateMs - b.dateMs);
  const byMs = new Map(sorted.map((c) => [c.dateMs, c.value]));
  const start = sorted[0].dateMs;
  const end = sorted[sorted.length - 1].dateMs;
  const gridStart = start - new Date(start).getUTCDay() * DAY_MS; // back to Sunday
  const peak = max ?? Math.max(1, ...sorted.map((c) => c.value ?? 0));

  const grid: { dateMs: number; inRange: boolean; value: number | null }[] = [];
  for (let d = gridStart; d <= end; d += DAY_MS) {
    grid.push({ dateMs: d, inRange: d >= start, value: byMs.has(d) ? byMs.get(d)! : null });
  }

  const cellStyle = (c: { inRange: boolean; value: number | null }): React.CSSProperties => {
    if (c.value != null) return { background: cssVar(role), opacity: 0.18 + 0.82 * Math.min(1, c.value / peak) };
    if (c.inRange) return { background: cssVar('status-error'), opacity: 0.22 }; // data gap
    return { background: 'transparent' };
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ width: 'max-content' }}>
          {grid.map((c) => (
            <div
              key={c.dateMs}
              className="h-3.5 w-3.5 rounded-[3px]"
              style={cellStyle(c)}
              title={
                c.value != null
                  ? `${new Date(c.dateMs).toISOString().slice(0, 10)}: ${formatValue(c.value)}`
                  : c.inRange
                    ? `${new Date(c.dateMs).toISOString().slice(0, 10)}: no data`
                    : ''
              }
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{legendLess}</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
          <span key={o} className="h-3 w-3 rounded-[3px]" style={{ background: cssVar(role), opacity: o }} />
        ))}
        <span>{legendMore}</span>
        <span className="ml-3 flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: cssVar('status-error'), opacity: 0.22 }} />
          gap
        </span>
      </div>
    </Card>
  );
}
