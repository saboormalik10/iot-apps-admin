'use client';

import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { SERIES_ROLES } from '@/components/charts/chart-utils';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { useDeviceSensors } from '@/lib/hooks/use-device-sensors';
import { MET_SENSORS, sensorLabel } from '../sensors';
import { IntervalSelect } from './interval-select';
import { useMetMultiSensor } from '../use-analytics';

const INTERVALS = [
  { key: '1min', label: '1 min' },
  { key: '5min', label: '5 min' },
  { key: '1h', label: '1 hour' },
];
const DEFAULT_SENSORS = ['temperature', 'pressure', 'humidity'];
const MAX_SENSORS = 5;

/**
 * MET multi-sensor overlay as SMALL MULTIPLES (plan §6 — no dual axis): one mini
 * time-series per selected sensor, each on its own unit-appropriate axis. Up to 5
 * sensors from the shared 15-sensor allow-list (§10.5).
 */
export function MultiSensorChart({ deviceId }: { deviceId?: string }) {
  const sensors = useDeviceSensors(deviceId);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SENSORS);
  const [interval, setInterval] = useState('5min');
  const { data, isLoading } = useMetMultiSensor(deviceId, selected, interval);

  const toggle = (key: string) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= MAX_SENSORS ? cur : [...cur, key],
    );

  // Offer only the sensors this station reports. A wind-only device otherwise
  // lists 15 options, 13 of which return an empty chart.
  const availableSensorOptions = MET_SENSORS.filter((option) => sensors.has(option.key));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Multi-sensor overlay</h3>
        <IntervalSelect value={interval} onChange={setInterval} options={INTERVALS} />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sensors">
        {availableSensorOptions.map((s) => {
          const on = selected.includes(s.key);
          return (
            <Button
              key={s.key}
              size="sm"
              variant={on ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              disabled={!on && selected.length >= MAX_SENSORS}
            >
              {s.label}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingState label="Loading sensors…" />
      ) : selected.length === 0 ? (
        <EmptyState title="Pick at least one sensor" body={`Select up to ${MAX_SENSORS} sensors to overlay.`} />
      ) : !data || !data.timestamps?.length ? (
        <EmptyState title="No data in range" body="Widen the date range or pick another device." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(data.series ?? []).map((s, idx) => {
            const rows = data.timestamps.map((t, i) => ({ timestampMs: t, value: s.values?.[i] ?? null }));
            return (
              <TimeSeriesChart
                key={s.sensor}
                data={rows}
                xKey="timestampMs"
                unit={s.unit}
                title={sensorLabel(s.sensor)}
                series={[{ key: 'value', label: sensorLabel(s.sensor), role: SERIES_ROLES[idx % SERIES_ROLES.length] }]}
                height={200}
                exportName={`met-${s.sensor}`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
