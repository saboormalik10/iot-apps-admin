'use client';

import { type ReactNode, useRef, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart as ReScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { downloadCsv, downloadSvgPng, fmt } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface ScatterPoint {
  x: number;
  y: number;
}

/** Least-squares fit → endpoints spanning the x-range, for a trend overlay. */
function trendSegment(points: ScatterPoint[]): [ScatterPoint, ScatterPoint] | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxy += p.x * p.y;
    sxx += p.x * p.x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ];
}

/**
 * ScatterChart — a correlation scatter with an optional least-squares trend line
 * and a free-form annotation slot (e.g. a Pearson-r badge) — plan §14. One series,
 * one axis pair. Ships the shared chart contract: table-view + CSV/PNG export.
 */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  title,
  role = 'chart-1',
  trend = true,
  annotation,
  height = 300,
  exportName = 'scatter',
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  title?: string;
  role?: PaletteRole;
  trend?: boolean;
  annotation?: ReactNode;
  height?: number;
  exportName?: string;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const segment = trend ? trendSegment(points) : null;

  const onExportCsv = () => downloadCsv(`${exportName}.csv`, [xLabel, yLabel], points.map((p) => ({ [xLabel]: p.x, [yLabel]: p.y })));
  const onExportPng = () => {
    const svg = wrapRef.current?.querySelector('svg');
    if (svg) downloadSvgPng(svg as SVGSVGElement, `${exportName}.png`);
  };

  return (
    <ChartFrame
      title={title}
      tableView={tableView}
      onToggleTableView={() => setTableView((v) => !v)}
      onExportCsv={onExportCsv}
      onExportPng={onExportPng}
      actions={annotation}
    >
      {tableView ? (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 text-right font-medium">{xLabel}{xUnit ? ` (${xUnit})` : ''}</th>
                <th className="px-2 py-1 text-right font-medium">{yLabel}{yUnit ? ` (${yUnit})` : ''}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(p.x, 1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(p.y, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ReScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                domain={['auto', 'auto']}
                label={{ value: `${xLabel}${xUnit ? ` (${xUnit})` : ''}`, position: 'insideBottom', offset: -12, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabel}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={48}
                domain={['auto', 'auto']}
                label={{ value: yUnit ?? yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <ZAxis range={[24, 24]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
                formatter={(value: number, name: string) => [fmt(value, 1), name]}
              />
              {segment ? (
                <ReferenceLine
                  ifOverflow="extendDomain"
                  segment={segment}
                  stroke="hsl(var(--status-warn))"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              ) : null}
              <Scatter data={points} fill={cssVar(role)} fillOpacity={0.55} isAnimationActive={false} />
            </ReScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
