'use client';

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatTile } from '@/components/charts/stat-tile';
import { BeaufortScale } from '@/components/charts/beaufort-scale';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt } from '@/components/charts/chart-utils';
import { useDeviceSensors } from '@/lib/hooks/use-device-sensors';
import { MET_SENSORS, sensorUnit } from '../sensors';
import { useMetStatistics } from '../use-analytics';

/**
 * MET statistical profile for one sensor — descriptive tiles (mean/median/spread/
 * percentiles) plus, for wind speed, the Beaufort scale (plan §6).
 */
export function StatisticsPanel({ deviceId }: { deviceId?: string }) {
  const sensors = useDeviceSensors(deviceId);
  /**
   * Wind speed by default.
   *
   * This opened on `temperature`, which the WindSonic stations do not report —
   * so the panel loaded empty, on a sensor that is not even in its own dropdown,
   * and every visitor had to change it before seeing anything. Wind is the
   * station's primary measurement and the one the rest of the screen is built
   * around.
   */
  const [sensor, setSensor] = useState('wind_speed');
  const { data, isLoading } = useMetStatistics(deviceId, sensor);
  const unit = sensorUnit(sensor);
  const withUnit = (v?: number | null) => (v == null ? '—' : `${fmt(v, 2)} ${unit}`);

  // Offer only the sensors this station reports. A wind-only device otherwise
  // lists 15 options, 13 of which return an empty chart.
  const availableSensorOptions = MET_SENSORS.filter((option) => sensors.has(option.key));

  /**
   * Fall back once the device's sensor list resolves.
   *
   * A station that reports no wind — a future water-quality or air-quality
   * stream — would otherwise sit on a default it does not have, showing the same
   * empty panel this change exists to remove. Only runs once the list is known,
   * because `sensors.has()` fails open and would otherwise reject nothing.
   */
  useEffect(() => {
    if (!sensors.resolved || availableSensorOptions.length === 0) return;
    if (!availableSensorOptions.some((o) => o.key === sensor)) {
      setSensor(availableSensorOptions[0].key);
    }
  }, [sensors.resolved, availableSensorOptions, sensor]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Statistics</h3>
        <Select value={sensor} onValueChange={setSensor}>
          <SelectTrigger className="h-8 w-[160px]" aria-label="Sensor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableSensorOptions.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading statistics…" />
      ) : !data || data.count === 0 ? (
        <EmptyState title="No data in range" body="Widen the date range or pick another sensor." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Mean" value={withUnit(data.mean)} sub={`n = ${data.count.toLocaleString()}`} />
            <StatTile label="Median" value={withUnit(data.median)} />
            <StatTile label="Std dev" value={withUnit(data.stdDev)} sub={`skew ${fmt(data.skewness, 2)}`} />
            <StatTile label="Range" value={withUnit(data.range)} />
            <StatTile label="Min" value={withUnit(data.min)} />
            <StatTile label="Max" value={withUnit(data.max)} />
            <StatTile label="P90" value={withUnit(data.p90)} />
            <StatTile label="P95" value={withUnit(data.p95)} />
          </div>
          {sensor === 'wind_speed' ? <BeaufortScale activeMs={data.mean} /> : null}
        </>
      )}
    </section>
  );
}
