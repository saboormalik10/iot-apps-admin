'use client';

import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { downloadCsv, downloadSvgPng, fmt } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface HistogramBar {
  /** X-axis category label (e.g. an NTU class range). */
  label: string;
  value: number;
  /** Design-system colour role — one per bar (fixed, never cycled). */
  role: PaletteRole;
  /** Optional descriptive sub-label surfaced in the tooltip + table (e.g. WHO class). */
  meta?: string;
}

/**
 * Histogram — a categorical bar chart where each bar carries its own fixed colour
 * role (plan §14). Used for the turbidity distribution over the 7 WHO/EPA classes:
 * the classes ARE the reference bands, coloured by our validated ramp (§10.9), not
 * the backend hex. Ships the shared chart contract: table-view + CSV/PNG export.
 */
export function Histogram({
  bars,
  title,
  unit,
  valueLabel = 'Count',
  height = 280,
  exportName = 'histogram',
  showBarLabels = true,
}: {
  bars: HistogramBar[];
  title?: string;
  unit?: string;
  valueLabel?: string;
  height?: number;
  exportName?: string;
  showBarLabels?: boolean;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const onExportCsv = () =>
    downloadCsv(
      `${exportName}.csv`,
      ['label', 'class', valueLabel],
      bars.map((b) => ({ label: b.label, class: b.meta ?? '', [valueLabel]: b.value })),
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
        <div className="max-h-[280px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Range</th>
                <th className="px-2 py-1 font-medium">Class</th>
                <th className="px-2 py-1 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label} className="border-b last:border-0">
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: cssVar(b.role) }} />
                      {b.label}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{b.meta ?? '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{b.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 16, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} />
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
                formatter={(value: number, _n, item) => [
                  `${value.toLocaleString()} ${valueLabel.toLowerCase()}`,
                  (item?.payload as HistogramBar)?.meta ?? '',
                ]}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {bars.map((b) => (
                  <Cell key={b.label} fill={cssVar(b.role)} />
                ))}
                {showBarLabels ? (
                  <LabelList dataKey="value" position="top" fontSize={10} fill="hsl(var(--muted-foreground))" formatter={(v: number) => (v ? fmt(v, 0) : '')} />
                ) : null}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
