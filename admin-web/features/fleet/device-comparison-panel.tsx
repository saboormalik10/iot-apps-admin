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
  const [sensor, setSensor] = useState('temperature');
  const [interval, setInterval] = useState('1h');

  // Default to the first two MET devices once the list loads.
  useEffect(() => {
    if (selected.length === 0 && metDevices.length > 0) {
      setSelected(metDevices.slice(0, Math.min(2, metDevices.length)).map((d) => d._id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metDevices.length]);

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
              {MET_SENSORS.map((s) => (
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
