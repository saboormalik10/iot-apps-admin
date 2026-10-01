'use client';

import { useEffect, useState } from 'react';
import type { LocationId, WindRoseBin } from '@/lib/api/types';
import { ROSE_BANDS, windRose } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { COMPASS, WindRose } from '@/components/charts/wind-rose';

/** The rose for the selected station and range — see components/charts/wind-rose.tsx. */
export function WindRoseCard({ locationId, days, minuteKey }: { locationId: LocationId; days: number; minuteKey: number }) {
  const [data, setData] = useState<{ bins: WindRoseBin[]; calmPct: number; samples: number } | null>(null);

  useEffect(() => {
    windRose(locationId, days).then(setData);
    // Recompute every ten minutes of demo time, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, days, Math.floor(minuteKey / 10)]);

  return (
    <ChartFrame
      as="h2"
      title="Wind direction and speed"
      footnote={`Where the wind blew from, and how hard — ${days === 1 ? 'last 24 hours' : `last ${days} days`}, 10-minute means`}
      table={
        data
          ? {
              head: ['From', ...ROSE_BANDS.map((b) => `${b.label} km/h`), 'All speeds'],
              rows: data.bins.map((b, i) => [
                `${COMPASS[i]} (${b.dirDeg}°)`,
                ...b.bands.map((x) => `${(x * 100).toFixed(1)} %`),
                `${(b.bands.reduce((a, x) => a + x, 0) * 100).toFixed(1)} %`,
              ]),
            }
          : undefined
      }
    >
      {data ? (
        <WindRose bins={data.bins} bandLabels={ROSE_BANDS.map((b) => b.label)} unit="km/h" calmPct={data.calmPct} />
      ) : (
        <div className="mx-auto aspect-square w-full max-w-[300px] animate-pulse rounded-full bg-muted/60" />
      )}
    </ChartFrame>
  );
}
