'use client';

import { useRef, useState } from 'react';
import { Area, ComposedChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { downloadCsv, downloadSvgPng, fmt } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface RangeBandRow {
  label: string;
  min: number | null;
  max: number | null;
  mean: number | null;
}

interface ChartRow {
  label: string;
  band: [number, number] | null;
  mean: number | null;
}

/**
 * RangeBandChart — a min–max shaded band with a mean line on ONE axis (plan §14,
 * §4: no dual-axis; small-multiples friendly). Nulls break the band/line rather
 * than plotting zero (§10.2). Ships the shared chart contract: table-view + export.
 */
export function RangeBandChart({
  rows,
  title,
  unit,
  role = 'chart-1',
  height = 220,
  exportName = 'range-band',
}: {
  rows: RangeBandRow[];
  title?: string;
  unit?: string;
  role?: PaletteRole;
  height?: number;
  exportName?: string;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const chartRows: ChartRow[] = rows.map((r) => ({
    label: r.label,
    band: r.min != null && r.max != null ? [r.min, r.max] : null,
    mean: r.mean,
  }));

  const onExportCsv = () =>
    downloadCsv(
      `${exportName}.csv`,
      ['label', 'min', 'mean', 'max'],
      rows.map((r) => ({ label: r.label, min: r.min ?? '', mean: r.mean ?? '', max: r.max ?? '' })),
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
        <div className="max-h-[240px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Day</th>
                <th className="px-2 py-1 text-right font-medium">Min</th>
                <th className="px-2 py-1 text-right font-medium">Mean</th>
                <th className="px-2 py-1 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1">{r.label}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r.min, 1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r.mean, 1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r.max, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={24} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={44} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Area dataKey="band" name="min–max" stroke="none" fill={cssVar(role)} fillOpacity={0.18} isAnimationActive={false} connectNulls />
              <Line dataKey="mean" name="mean" stroke={cssVar(role)} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
