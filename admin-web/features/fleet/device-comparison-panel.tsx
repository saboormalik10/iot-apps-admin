'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeSeriesChart, type SeriesDef } from '@/components/charts/time-series-chart';
import { SERIES_ROLES } from '@/components/charts/chart-utils';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { MET_SENSORS, sensorUnit } from '@/features/analytics/sensors';
import { INTERVALS } from '@/lib/api/scales';
import { useDeviceComparison } from './use-fleet';

const MAX_DEVICES = 5;

/**
 * Device comparison overlay (plan §6, §Month 10) — one MET sensor across up to 5
 * devices on a shared time axis (one axis, §4). Series colours follow the device
 * (fixed order). MET-LINK devices only, since the comparison uses the MET sensor map.
 */
export function DeviceComparisonPanel() {
  const { data: devices = [] } = useDashboardDevices();
  const metDevices = useMemo(() => devices.filter((d) => d.type === 'MET-LINK'), [devices]);

  const [selected, setSelected] = useState<string[]>([]);
  const [sensor, setSensor] = useState('wind_speed');
  const [interval, setInterval] = useState('1h');

  // Default to the first two MET devices once the list loads.
  useEffect(() => {
    if (selected.length === 0 && metDevices.length > 0) {
      setSelected(metDevices.slice(0, Math.min(2, metDevices.length)).map((d) => d._id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metDevices.length]);

  /**
   * Offer only sensors at least one SELECTED device actually reports.
   *
   * The dropdown used to list every MET sensor unconditionally — 15 options on a
   * wind-only station, 13 of which can never return anything — and defaulted to
   * `temperature`, which this station has never sent, so the panel opened on
   * "Loading comparison…" that never resolved.
   *
   * Union, not intersection, across the selected devices: comparing a wind-only
   * station against a wind+temperature one should still offer temperature — the
   * wind-only station's series is simply empty for it, which the chart already
   * handles, rather than the picker hiding a sensor that's genuinely comparable
   * for at least one of the lines on screen.
   *
   * `availableSensors` comes straight off `DashboardDevice` — the same list this
   * component already fetched for the device-toggle row above, so this costs
   * nothing extra. `null`/undefined (not yet ingested) fails OPEN, matching
   * `useDeviceSensors`: a device with no opinion yet should not narrow the list
   * for everyone else selected alongside it.
   */
  const availableSensorOptions = useMemo(() => {
    const selectedDevices = metDevices.filter((d) => selected.includes(d._id));
    if (selectedDevices.length === 0) return MET_SENSORS;
    const known = selectedDevices.filter((d) => d.availableSensors?.length);
    if (known.length === 0) return MET_SENSORS; // nobody has reported yet — fail open
    const union = new Set(known.flatMap((d) => d.availableSensors ?? []));
    return MET_SENSORS.filter((s) => union.has(s.key));
  }, [metDevices, selected]);

  // Fall back once the selection resolves to a set that doesn't include the
  // current sensor — e.g. switching from an all-sensor station to a wind-only
  // one. Mirrors the Statistics panel's fallback (M25).
  useEffect(() => {
    if (availableSensorOptions.length === 0) return;
    if (!availableSensorOptions.some((s) => s.key === sensor)) {
      setSensor(availableSensorOptions[0].key);
    }
  }, [availableSensorOptions, sensor]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_DEVICES ? cur : [...cur, id]));

  const { data, isLoading } = useDeviceComparison(selected, sensor, interval);

  const { rows, series } = useMemo(() => {
    if (!data) return { rows: [] as Record<string, number | null>[], series: [] as SeriesDef[] };
    const series: SeriesDef[] = data.series.map((s, i) => ({
      key: s.deviceId,
      label: s.deviceName,
      role: SERIES_ROLES[i % SERIES_ROLES.length],
    }));
    const byTs = new Map<number, Record<string, number | null>>();
    for (const s of data.series) {
      for (const pt of s.values) {
        let row = byTs.get(pt.ts);
        if (!row) {
          row = { ts: pt.ts };
          byTs.set(pt.ts, row);
        }
        row[s.deviceId] = pt.value;
      }
    }
    const rows = Array.from(byTs.values()).sort((a, b) => (a.ts as number) - (b.ts as number));
    return { rows, series };
  }, [data]);

  if (metDevices.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No MET-LINK devices" body="Device comparison overlays a MET sensor across devices; pair a MET-LINK device to use it." />
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Device comparison</h3>
        <div className="flex gap-2">
          <Select value={sensor} onValueChange={setSensor}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
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
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Devices to compare">
        {metDevices.map((d) => {
          const on = selected.includes(d._id);
          return (
            <Button
              key={d._id}
              size="sm"
              variant={on ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => toggle(d._id)}
              aria-pressed={on}
              disabled={!on && selected.length >= MAX_DEVICES}
            >
              {d.name}
            </Button>
          );
        })}
      </div>

      {selected.length === 0 ? (
        <EmptyState title="Pick devices" body="Select up to 5 devices to overlay." />
      ) : isLoading ? (
        <LoadingState label="Loading comparison…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No data" body="No readings for this sensor in the current scope." />
      ) : (
        <TimeSeriesChart
          data={rows}
          series={series}
          xKey="ts"
          unit={sensorUnit(sensor)}
          xFormatter={(v) => new Date(Number(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          exportName={`device-comparison-${sensor}`}
        />
      )}
    </Card>
  );
}
