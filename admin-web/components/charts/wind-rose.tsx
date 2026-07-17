'use client';

import { useMemo, useRef, useState } from 'react';
import { Group } from '@visx/group';
import { Arc } from '@visx/shape';
import { WIND_SPEED_BANDS, windBandIndex, cssVar } from '@/lib/api/scales';
import { ChartTextureDefs, textureFill } from './chart-texture';
import { COMPASS_16, sectorIndex, downloadCsv, downloadSvgPng } from './chart-utils';
import { ChartFrame } from './chart-frame';

export interface WindDatum {
  speedMs: number | null;
  dirDeg: number | null;
}

/**
 * WindRose — the signature polar stacked bar (visx): 16 compass sectors × the
 * 5 Smithtek-aligned speed bands (§10.9). The parent picks the direction field
 * (true vs relative) and the sample window (10-min vs 2-min); this component
 * buckets and renders. Ships the shared table-view + export contract.
 */
export function WindRose({
  samples = [],
  matrix: matrixProp,
  size = 320,
  title = 'Wind rose',
  exportName = 'wind-rose',
}: {
  /** Raw samples (dashboard) — bucketed here. */
  samples?: WindDatum[];
  /** Pre-bucketed 16×bands counts (analytics aggregate endpoint) — used as-is. */
  matrix?: number[][];
  size?: number;
  title?: string;
  exportName?: string;
}) {
  const [tableView, setTableView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 16 sectors × 5 bands matrix of counts — either supplied pre-aggregated, or
  // bucketed from raw samples.
  const { matrix, total, maxSector } = useMemo(() => {
    const m: number[][] =
      matrixProp ?? Array.from({ length: 16 }, () => Array(WIND_SPEED_BANDS.length).fill(0));
    if (!matrixProp) {
      for (const s of samples) {
        if (s.speedMs == null || s.dirDeg == null) continue;
        m[sectorIndex(s.dirDeg)][windBandIndex(s.speedMs)] += 1;
      }
    }
    const totals = m.map((row) => row.reduce((a, b) => a + b, 0));
    return { matrix: m, total: totals.reduce((a, b) => a + b, 0), maxSector: Math.max(1, ...totals) };
  }, [samples, matrixProp]);

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 24;
  const rFor = (count: number) => (count / maxSector) * maxR;

  const onExportCsv = () =>
    downloadCsv(
      `${exportName}.csv`,
      ['sector', ...WIND_SPEED_BANDS.map((b) => b.label)],
      matrix.map((row, i) => {
        const out: Record<string, unknown> = { sector: COMPASS_16[i] };
        WIND_SPEED_BANDS.forEach((b, j) => (out[b.label] = row[j]));
        return out;
      }),
    );
  const onExportPng = () => downloadSvgPng(wrapRef.current?.querySelector('svg') ?? null, `${exportName}.png`);

  return (
    <ChartFrame
      title={title}
      tableView={tableView}
      onToggleTableView={() => setTableView((v) => !v)}
      onExportCsv={onExportCsv}
      onExportPng={onExportPng}
    >
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No wind samples in this window.</p>
      ) : tableView ? (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Sector</th>
                {WIND_SPEED_BANDS.map((b) => (
                  <th key={b.label} className="px-2 py-1 text-right font-medium">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1">{COMPASS_16[i]}</td>
                  {row.map((c, j) => (
                    <td key={j} className="px-2 py-1 text-right tabular-nums">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div ref={wrapRef}>
            <svg width={size} height={size} role="img" aria-label={`${title}: ${total} samples`}>
              <ChartTextureDefs roles={WIND_SPEED_BANDS.map((b) => b.role)} />
              <Group>
                {/* radial grid rings */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <circle key={f} cx={cx} cy={cy} r={maxR * f} fill="none" stroke="hsl(var(--border))" strokeDasharray="2 3" />
                ))}
                {/* compass labels (N/E/S/W) */}
                {[0, 4, 8, 12].map((i) => {
                  const rad = (i * 22.5 * Math.PI) / 180;
                  const lx = cx + Math.sin(rad) * (maxR + 12);
                  const ly = cy - Math.cos(rad) * (maxR + 12);
                  return (
                    <text key={i} x={lx} y={ly} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--muted-foreground))">
                      {COMPASS_16[i]}
                    </text>
                  );
                })}
                {/* stacked polar bars */}
                {matrix.map((row, s) => {
                  const start = ((s * 22.5 - 11.25) * Math.PI) / 180;
                  const end = ((s * 22.5 + 11.25) * Math.PI) / 180;
                  let acc = 0;
                  return row.map((count, b) => {
                    if (count === 0) return null;
                    const inner = rFor(acc);
                    acc += count;
                    const outer = rFor(acc);
                    return (
                      <Arc
                        key={`${s}-${b}`}
                        startAngle={start}
                        endAngle={end}
                        innerRadius={inner}
                        outerRadius={outer}
                        padAngle={0.01}
                        fill={textureFill(WIND_SPEED_BANDS[b].role)}
                        transform={`translate(${cx},${cy})`}
                      />
                    );
                  });
                })}
              </Group>
            </svg>
          </div>
          {/* band legend */}
          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {WIND_SPEED_BANDS.map((b) => (
              <li key={b.label} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cssVar(b.role) }} aria-hidden />
                {b.label}
                <span className="tabular-nums">
                  ({b.minMs}–{b.maxMs === Infinity ? '∞' : b.maxMs} m/s)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}
