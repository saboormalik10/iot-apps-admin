'use client';

import { Card } from '@/components/ui/card';
import { cssVar } from '@/lib/api/scales';
import type { MetDailySummary } from '@/lib/api/types';

const DAY_MS = 86_400_000;

/**
 * Data-completeness calendar heatmap (plan §6, headline data-quality view) — a
 * GitHub-style grid, one cell per day, single-hue sequential by completeness %.
 * Days inside the covered span with no summary are flagged as gaps.
 */
export function CompletenessHeatmap({ summaries }: { summaries: MetDailySummary[] }) {
  if (!summaries.length) return null;

  const byMs = new Map(summaries.map((s) => [s.dateMs, s]));
  const start = summaries[0].dateMs;
  const end = summaries[summaries.length - 1].dateMs;
  const gridStart = start - new Date(start).getUTCDay() * DAY_MS; // back to Sunday

  const cells: { dateMs: number; inRange: boolean; pct: number | null }[] = [];
  for (let d = gridStart; d <= end; d += DAY_MS) {
    const s = byMs.get(d);
    cells.push({ dateMs: d, inRange: d >= start, pct: s ? s.completenessPercent : null });
  }

  const cellStyle = (c: { inRange: boolean; pct: number | null }): React.CSSProperties => {
    if (c.pct != null) return { background: cssVar('chart-2'), opacity: 0.2 + 0.8 * (c.pct / 100) };
    if (c.inRange) return { background: cssVar('status-error'), opacity: 0.25 }; // data gap
    return { background: 'transparent' };
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Data completeness</h3>
        <span className="text-xs text-muted-foreground">daily sample coverage</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ width: 'max-content' }}>
          {cells.map((c) => (
            <div
              key={c.dateMs}
              className="h-3.5 w-3.5 rounded-[3px]"
              style={cellStyle(c)}
              title={
                c.pct != null
                  ? `${new Date(c.dateMs).toISOString().slice(0, 10)}: ${c.pct}%`
                  : c.inRange
                    ? `${new Date(c.dateMs).toISOString().slice(0, 10)}: no data`
                    : ''
              }
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
          <span key={o} className="h-3 w-3 rounded-[3px]" style={{ background: cssVar('chart-2'), opacity: o }} />
        ))}
        <span>More</span>
        <span className="ml-3 flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: cssVar('status-error'), opacity: 0.25 }} />
          gap
        </span>
      </div>
    </Card>
  );
}
