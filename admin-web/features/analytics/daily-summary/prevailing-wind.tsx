'use client';

import { Card } from '@/components/ui/card';
import { Meter } from '@/components/charts/meter';
import { COMPASS_16, sectorIndex } from '@/components/charts/chart-utils';
import { cssVar } from '@/lib/api/scales';
import type { MetDailySummary } from '@/lib/api/types';

/**
 * Prevailing-wind compass + calm-% meter (plan §6). Aggregates each day's
 * prevailing direction into the 16 sectors and points a needle at the dominant
 * one; the meter shows the average calm share.
 */
export function PrevailingWind({ summaries }: { summaries: MetDailySummary[] }) {
  const sectors = new Array(16).fill(0);
  let calmSum = 0;
  let calmN = 0;
  for (const s of summaries) {
    if (s.windDirPrevailing != null) sectors[sectorIndex(s.windDirPrevailing)]++;
    if (s.windCalmPct != null) {
      calmSum += s.windCalmPct;
      calmN++;
    }
  }
  const maxSector = sectors.reduce((best, c, i) => (c > sectors[best] ? i : best), 0);
  const hasWind = sectors[maxSector] > 0;
  const bearing = maxSector * 22.5;
  const calmPct = calmN ? Math.round((calmSum / calmN) * 10) / 10 : null;

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const rad = (bearing * Math.PI) / 180;
  const tipX = cx + Math.sin(rad) * r;
  const tipY = cy - Math.cos(rad) * r;

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-medium">Prevailing wind</h3>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} role="img" aria-label={`Prevailing wind ${hasWind ? COMPASS_16[maxSector] : 'n/a'}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" />
          {[0, 4, 8, 12].map((i) => {
            const a = (i * 22.5 * Math.PI) / 180;
            return (
              <text
                key={i}
                x={cx + Math.sin(a) * (r + 9)}
                y={cy - Math.cos(a) * (r + 9)}
                fontSize={10}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))"
              >
                {COMPASS_16[i]}
              </text>
            );
          })}
          {hasWind ? (
            <>
              <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={cssVar('chart-1')} strokeWidth={3} strokeLinecap="round" />
              <circle cx={tipX} cy={tipY} r={4} fill={cssVar('chart-1')} />
            </>
          ) : null}
          <circle cx={cx} cy={cy} r={3} fill="hsl(var(--muted-foreground))" />
        </svg>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-2xl font-semibold">{hasWind ? COMPASS_16[maxSector] : '—'}</p>
            <p className="text-xs text-muted-foreground">{hasWind ? `${bearing}° prevailing` : 'No wind data'}</p>
          </div>
          <Meter value={calmPct} unit="%" label="Calm" />
        </div>
      </div>
    </Card>
  );
}
