'use client';

import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { StatusBadge, type StatusTone } from '@/components/charts/status-badge';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { IntervalSelect } from './interval-select';
import { useMetComfort } from '../use-analytics';

const INTERVALS = [
  { key: '1h', label: '1 hour' },
  { key: '5min', label: '5 min' },
];

/** Comfort label → badge tone (never colour alone — StatusBadge adds an icon). */
function comfortTone(label: string): StatusTone {
  if (label === 'Very Hot' || label === 'Dangerously Cold') return 'error';
  if (label === 'Hot' || label === 'Very Cold') return 'warn';
  if (label === 'Comfortable') return 'ok';
  return 'info';
}

/**
 * MET comfort indices (plan §6) — heat index + wind chill + air temp on one °C
 * axis, with a live comfort-label badge for the latest bucket.
 */
export function ComfortIndicesChart({ deviceId }: { deviceId?: string }) {
  const [interval, setInterval] = useState('1h');
  const { data, isLoading } = useMetComfort(deviceId, interval);

  const points = data?.data ?? [];
  const latest = points.length ? points[points.length - 1] : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Comfort indices</h3>
        <div className="flex items-center gap-2">
          {latest ? <StatusBadge tone={comfortTone(latest.comfortLabel)} label={latest.comfortLabel} /> : null}
          <IntervalSelect value={interval} onChange={setInterval} options={INTERVALS} />
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading comfort indices…" />
      ) : points.length === 0 ? (
        <EmptyState title="No data in range" body="Widen the date range or pick another device." />
      ) : (
        <TimeSeriesChart
          data={points.map((d) => ({
            timestampMs: d.ts,
            tempC: d.tempC,
            heatIndexC: d.heatIndexC,
            windChillC: d.windChillC,
          }))}
          xKey="timestampMs"
          unit="°C"
          series={[
            { key: 'tempC', label: 'Air temp', role: 'chart-1' },
            { key: 'heatIndexC', label: 'Heat index', role: 'chart-8' },
            { key: 'windChillC', label: 'Wind chill', role: 'chart-2' },
          ]}
          exportName="met-comfort"
        />
      )}
    </section>
  );
}
