'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import type { MetDailySummary } from '@/lib/api/types';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const tooltipStyle: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
};

function DayBars({
  title,
  unit,
  rows,
  role,
}: {
  title: string;
  unit: string;
  rows: { date: string; value: number | null }[];
  role: PaletteRole;
}) {
  return (
    <Card className="space-y-2 p-4">
      <h4 className="text-sm font-medium">
        {title} <span className="text-xs font-normal text-muted-foreground">({unit})</span>
      </h4>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={24} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
            <Bar dataKey="value" name={title} fill={cssVar(role)} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Daily solar energy (kWh/m²) and precipitation total (mm) bars (plan §6). */
export function SolarPrecipBars({ summaries }: { summaries: MetDailySummary[] }) {
  const solarRows = summaries.map((s) => ({ date: fmtDate(s.dateMs), value: s.solarDailyKwhM2 }));
  const precipRows = summaries.map((s) => ({ date: fmtDate(s.dateMs), value: s.precipTotalMm }));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DayBars title="Solar energy" unit="kWh/m²" rows={solarRows} role="chart-8" />
      <DayBars title="Precipitation" unit="mm" rows={precipRows} role="chart-2" />
    </div>
  );
}
