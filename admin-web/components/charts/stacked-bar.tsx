'use client';

import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { downloadCsv, downloadSvgPng, fmt } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface StackSeries {
  key: string;
  label: string;
  /** Fixed categorical role — follows the entity (e.g. probe range), never rank. */
  role: PaletteRole;
}

/**
 * StackedBar — stacked categorical bars with fixed per-series colour roles
 * (plan §14, §4: categorical hues in fixed order). Used for the daily probe-range
 * (R1/R2/R3) breakdown. Ships the shared chart contract: legend, table-view,
 * CSV/PNG export.
 */
export function StackedBar<T extends Record<string, number | string>>({
  data,
  xKey,
  series,
  title,
  unit,
  xFormatter = (v) => String(v),
  height = 300,
  exportName = 'stacked',
}: {
  data: T[];
  xKey: keyof T & string;
  series: StackSeries[];
  title?: string;
  unit?: string;
  xFormatter?: (v: T[keyof T]) => string;
  height?: number;
  exportName?: string;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const onExportCsv = () =>
    downloadCsv(
      `${exportName}.csv`,
      [xKey, ...series.map((s) => s.label)],
      data.map((row) => {
        const out: Record<string, unknown> = { [xKey]: xFormatter(row[xKey]) };
        for (const s of series) out[s.label] = row[s.key] ?? '';
        return out;
      }),
    );
  const onExportPng = () => {
    const svg = wrapRef.current?.querySelector('svg');
    if (svg) downloadSvgPng(svg as SVGSVGElement, `${exportName}.png`);
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
                <th className="px-2 py-1 font-medium">{xKey}</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-1 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1">{xFormatter(row[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right tabular-nums">{fmt(Number(row[s.key]), 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey={xKey} tickFormatter={(v) => xFormatter(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={24} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
                labelFormatter={(v) => xFormatter(v as T[keyof T])}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={cssVar(s.role)} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
