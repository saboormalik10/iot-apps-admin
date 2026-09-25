'use client';

import { useRef, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PaletteRole } from '@/lib/api/scales';
import { roleColor, downloadCsv, fmt } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface SeriesDef {
  key: string;
  label: string;
  role: PaletteRole;
}

/**
 * TimeSeriesChart — multi-line time series on ONE axis (plan §4: no dual-axis).
 * Nulls render as GAPS (`connectNulls={false}`, §10.2). Ships the shared chart
 * contract: crosshair tooltip, a table-view toggle, and CSV/PNG export.
 */
export function TimeSeriesChart<T extends Record<string, number | null>>({
  data,
  series,
  xKey,
  title,
  unit,
  xFormatter = (v) => new Date(Number(v)).toLocaleTimeString(),
  yFormatter = (v) => fmt(v, 2),
  height = 300,
  exportName = 'series',
  brush = false,
}: {
  data: T[];
  series: SeriesDef[];
  xKey: keyof T & string;
  title?: string;
  unit?: string;
  xFormatter?: (v: number | null) => string;
  yFormatter?: (v: number | null) => string;
  height?: number;
  exportName?: string;
  /** Render a Recharts range navigator under the chart to zoom/pan a long series (plan §5.4). */
  brush?: boolean;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const onExportCsv = () => {
    const cols = [xKey, ...series.map((s) => s.key)];
    downloadCsv(
      `${exportName}.csv`,
      cols,
      data.map((row) => {
        const out: Record<string, unknown> = { [xKey]: xFormatter(row[xKey]) };
        for (const s of series) out[s.key] = row[s.key] ?? '';
        return out;
      }),
    );
  };
  const onExportPng = () => {
    const svg = wrapRef.current?.querySelector('svg');
    if (svg) import('./chart-utils').then((m) => m.downloadSvgPng(svg as SVGSVGElement, `${exportName}.png`));
  };

  return (
    <ChartFrame
      title={title}
      unit={unit}
      tableView={tableView}
      onToggleTableView={() => setTableView((v) => !v)}
      onExportCsv={onExportCsv}
      onExportPng={onExportPng}
    >
      {tableView ? (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Time</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-1 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1 tabular-nums">{xFormatter(row[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right tabular-nums">{yFormatter(row[s.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ height: brush ? height + 28 : height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: brush ? 4 : 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey={xKey}
                tickFormatter={(v) => xFormatter(v)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                minTickGap={40}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} tickFormatter={(v) => fmt(v, 1)} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
                labelFormatter={(v) => xFormatter(Number(v))}
                formatter={(value: number, name: string) => [yFormatter(value), name]}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={roleColor(s.role)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              {brush ? (
                <Brush
                  dataKey={xKey}
                  height={24}
                  travellerWidth={8}
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted))"
                  tickFormatter={(v) => xFormatter(v)}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
