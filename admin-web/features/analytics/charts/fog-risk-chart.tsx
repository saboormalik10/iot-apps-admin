'use client';

import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { StatusBadge, type StatusTone } from '@/components/charts/status-badge';
import { LoadingState, EmptyState } from '@/components/screen-states';
import type { MetFogPoint } from '@/lib/api/types';
import { IntervalSelect } from './interval-select';
import { useMetFogRisk } from '../use-analytics';

const INTERVALS = [
  { key: '1h', label: '1 hour' },
  { key: '5min', label: '5 min' },
];

const fogTone = (level: MetFogPoint['fogRisk']): StatusTone =>
  level === 'HIGH' ? 'error' : level === 'MODERATE' ? 'warn' : 'ok';

/**
 * MET fog risk (plan §6) — air-temp vs dew-point with the dew-point spread; a
 * small spread (temp ≈ dew point) means fog. Latest bucket gets a risk badge.
 */
export function FogRiskChart({ deviceId }: { deviceId?: string }) {
  const [interval, setInterval] = useState('1h');
  const { data, isLoading } = useMetFogRisk(deviceId, interval);

  const points = data?.data ?? [];
  const latest = points.length ? points[points.length - 1] : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Fog risk</h3>
        <div className="flex items-center gap-2">
          {latest ? <StatusBadge tone={fogTone(latest.fogRisk)} label={`${latest.fogRisk} · spread ${latest.spread}°C`} /> : null}
          <IntervalSelect value={interval} onChange={setInterval} options={INTERVALS} />
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading fog risk…" />
      ) : points.length === 0 ? (
        <EmptyState title="No dew-point data in range" body="Widen the date range or pick another device." />
      ) : (
        <TimeSeriesChart
          data={points.map((d) => ({
            timestampMs: d.ts,
            tempC: d.tempC,
            dewPointC: d.dewPointC,
            spread: d.spread,
          }))}
          xKey="timestampMs"
          unit="°C"
          series={[
            { key: 'tempC', label: 'Air temp', role: 'chart-1' },
            { key: 'dewPointC', label: 'Dew point', role: 'chart-2' },
            { key: 'spread', label: 'Spread', role: 'chart-6' },
          ]}
          exportName="met-fog-risk"
        />
      )}
    </section>
  );
}
