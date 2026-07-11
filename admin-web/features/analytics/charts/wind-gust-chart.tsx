'use client';

import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { COMPASS_16, sectorIndex, fmt } from '@/components/charts/chart-utils';
import { StatTile } from '@/components/charts/stat-tile';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { IntervalSelect } from './interval-select';
import { useMetWindGust } from '../use-analytics';

const INTERVALS = [
  { key: '1h', label: '1 hour' },
  { key: '4h', label: '4 hours' },
  { key: '1d', label: '1 day' },
];

const compass = (deg: number | null) => (deg == null ? '—' : COMPASS_16[sectorIndex(deg)]);
const xFmt = (v: number | null) =>
  new Date(Number(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });

/**
 * MET wind-gust history — peak wind per bucket (plan §6). The peak of the whole
 * window is called out with its gust direction (a compass label, not a 2nd axis).
 */
export function WindGustChart({ deviceId }: { deviceId?: string }) {
  const [interval, setInterval] = useState('1h');
  const { data, isLoading } = useMetWindGust(deviceId, interval);

  const points = data?.data ?? [];
  const peak = points.length ? points.reduce((a, b) => (b.gustMs > a.gustMs ? b : a), points[0]) : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Wind gust history</h3>
        <IntervalSelect value={interval} onChange={setInterval} options={INTERVALS} />
      </div>

      {isLoading ? (
        <LoadingState label="Loading gusts…" />
      ) : points.length === 0 ? (
        <EmptyState title="No wind data in range" body="Widen the date range or pick a device with wind data." />
      ) : (
        <>
          {peak ? (
            <StatTile
              label="Peak gust"
              value={`${fmt(peak.gustMs, 1)} m/s`}
              sub={`from ${compass(peak.dirDeg)} · ${new Date(peak.ts).toLocaleString()}`}
            />
          ) : null}
          <TimeSeriesChart
            data={points.map((d) => ({ timestampMs: d.ts, gust: d.gustMs }))}
            xKey="timestampMs"
            unit="m/s"
            title="Peak wind per bucket"
            xFormatter={xFmt}
            series={[{ key: 'gust', label: 'Gust', role: 'chart-1' }]}
            exportName="met-wind-gust"
          />
        </>
      )}
    </section>
  );
}
