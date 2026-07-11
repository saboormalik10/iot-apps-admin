'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useScope } from '@/lib/hooks/use-scope';
import { useMetHistory } from './use-dashboard';

/** The 9 MET dashboard sensors (backend SENSOR_FIELD_MAP). */
const SENSORS: { key: string; label: string }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'wind_speed', label: 'Wind speed' },
  { key: 'solar', label: 'Solar' },
  { key: 'precipitation', label: 'Precipitation' },
  { key: 'dew_point', label: 'Dew point' },
  { key: 'voltage', label: 'Voltage' },
];

/**
 * MET 1-minute history (plan §6) — a single-sensor time series (min/avg/max per
 * 1-min bucket) with a sensor picker. Range comes from the global Scope Bar.
 */
export function MetHistoryPanel({ deviceId }: { deviceId?: string }) {
  const { window, scope } = useScope();
  const [sensor, setSensor] = useState('temperature');

  const params = deviceId
    ? { deviceId, sensor, from: window.from ?? window.to - 6 * 3_600_000, to: window.to, includeDemo: scope.includeDemo }
    : undefined;
  const { data, isLoading } = useMetHistory(params);

  if (!deviceId) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Sensor history (1-min)</h3>
        <Select value={sensor} onValueChange={setSensor}>
          <SelectTrigger className="h-8 w-[150px]" aria-label="Sensor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SENSORS.map((s) => (
              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <LoadingState label="Loading history…" />
      ) : !data?.data?.length ? (
        <EmptyState title="No history in range" body="Widen the date range or pick another sensor." />
      ) : (
        <TimeSeriesChart
          data={data.data as unknown as Array<Record<string, number | null>>}
          xKey="timestampMs"
          unit={data.unit}
          series={[
            { key: 'avg', label: 'Average', role: 'chart-1' },
            { key: 'min', label: 'Min', role: 'chart-3' },
            { key: 'max', label: 'Max', role: 'chart-6' },
          ]}
          exportName={`met-${sensor}`}
        />
      )}
    </Card>
  );
}
