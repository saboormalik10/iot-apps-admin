'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { BEAUFORT, WIND_SPEED_BANDS, windBandIndex, cssVar } from '@/lib/api/scales';
import type { MetDailySummary } from '@/lib/api/types';

// Collapse the 13 Beaufort forces into the 5 wind-speed bands so the stack reuses
// the (validated) wind-rose colours instead of inventing 13 of them.
const FORCE_TO_BAND = BEAUFORT.map((b) => windBandIndex(b.minMs));
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Per-day Beaufort distribution (plan §6) — stacked hours-by-band per day. */
export function BeaufortDistribution({ summaries }: { summaries: MetDailySummary[] }) {
  const rows = summaries.map((s) => {
    const row: Record<string, number | string> = { date: fmtDate(s.dateMs) };
    for (const band of WIND_SPEED_BANDS) row[band.label] = 0;
    s.beaufortDistribution.forEach((count, force) => {
      const band = WIND_SPEED_BANDS[FORCE_TO_BAND[force] ?? 0];
      row[band.label] = (row[band.label] as number) + count;
    });
    return row;
  });

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-medium">Beaufort distribution</h3>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={24} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {WIND_SPEED_BANDS.map((band) => (
              <Bar key={band.label} dataKey={band.label} stackId="beaufort" fill={cssVar(band.role)} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
