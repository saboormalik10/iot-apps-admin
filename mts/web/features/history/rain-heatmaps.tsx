'use client';

import { useEffect, useState } from 'react';
import type { LocationId } from '@/lib/api/types';
import { rainfallByHour } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { Heatmap } from '@/components/charts/heatmap';
import { fmtDay } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';

/**
 * Rainfall by hour of day for the last fortnight, one grid per gauge. The two
 * share a scale so they compare directly — the same storm is darker at
 * Marrickville than at Belmore, which is the whole reason the corridor has two
 * gauges and a fallback between them.
 */
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}`);

export function RainHeatmaps({ minuteKey }: { minuteKey: number }) {
  const gauges = STATIONS.filter((s) => s.sensors.some((x) => x.parameter === 'rainfall'));
  const [grids, setGrids] = useState<Record<string, { day: number; hours: number[] }[]> | null>(null);

  useEffect(() => {
    Promise.all(gauges.map((g) => rainfallByHour(g.id as LocationId, 14).then((rows) => [g.id, rows] as const))).then((pairs) =>
      setGrids(Object.fromEntries(pairs)),
    );
    // Hourly cells: refresh when the hour turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(minuteKey / 60)]);

  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      {gauges.map((g) => {
        const rows = grids?.[g.id];
        return (
          <ChartFrame
            key={g.id}
            as="h2"
            title={`Rainfall by hour — ${g.name}`}
            unit="mm"
            footnote="Last 14 days, one cell per hour. Both gauges on the same scale."
            table={
              rows
                ? {
                    head: ['Day', ...HOURS.map((h) => `${h}:00`)],
                    rows: rows.map((r) => [fmtDay(r.day), ...r.hours.map((v) => (Number.isNaN(v) ? '' : v))]),
                  }
                : undefined
            }
          >
            {rows ? (
              <Heatmap
                rows={rows.map((r) => ({ label: fmtDay(r.day), cells: r.hours }))}
                columns={HOURS}
                unit="mm"
                max={35}
                valueName="rain in the hour"
              />
            ) : (
              <div className="h-64 animate-pulse rounded bg-muted/60" />
            )}
          </ChartFrame>
        );
      })}
    </div>
  );
}
