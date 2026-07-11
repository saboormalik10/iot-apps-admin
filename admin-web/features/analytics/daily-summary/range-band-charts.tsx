'use client';

import { Area, ComposedChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import type { MetDailySummary } from '@/lib/api/types';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const band = (min: number | null, max: number | null): [number, number] | null =>
  min != null && max != null ? [min, max] : null;

interface BandRow {
  date: string;
  band: [number, number] | null;
  mean: number | null;
}

const tooltipStyle: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
};

function RangeBandChart({ title, unit, rows, role }: { title: string; unit: string; rows: BandRow[]; role: PaletteRole }) {
  return (
    <Card className="space-y-2 p-4">
      <h4 className="text-sm font-medium">
        {title} <span className="text-xs font-normal text-muted-foreground">({unit})</span>
      </h4>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={24} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              dataKey="band"
              name="min–max"
              stroke="none"
              fill={cssVar(role)}
              fillOpacity={0.18}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="mean"
              name="mean"
              stroke={cssVar(role)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/**
 * Per-sensor daily min–max range bands with a mean line (plan §6, small multiples,
 * no dual axis) for temperature, pressure and humidity.
 */
export function RangeBandCharts({ summaries }: { summaries: MetDailySummary[] }) {
  const tempRows = summaries.map((s) => ({ date: fmtDate(s.dateMs), band: band(s.tempMinC, s.tempMaxC), mean: s.tempAvgC }));
  const pressRows = summaries.map((s) => ({ date: fmtDate(s.dateMs), band: band(s.pressureMinHpa, s.pressureMaxHpa), mean: s.pressureAvgHpa }));
  const humRows = summaries.map((s) => ({ date: fmtDate(s.dateMs), band: band(s.humidityMinPct, s.humidityMaxPct), mean: s.humidityAvgPct }));

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <RangeBandChart title="Temperature" unit="°C" rows={tempRows} role="chart-1" />
      <RangeBandChart title="Pressure" unit="hPa" rows={pressRows} role="chart-2" />
      <RangeBandChart title="Humidity" unit="%" rows={humRows} role="chart-6" />
    </div>
  );
}
