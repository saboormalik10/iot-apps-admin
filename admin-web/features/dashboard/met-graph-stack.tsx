'use client';

import { Card } from '@/components/ui/card';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useScope } from '@/lib/hooks/use-scope';
import { useMetHistory } from './use-dashboard';

/**
 * The per-sensor stack (mirrors the mobile "graphs" layout + the Parklife graph
 * stack, screenshots 2–3). One single-series line chart per sensor, all sharing
 * the Scope-Bar window. The PRIMARY chart (wind speed) carries the brush/range
 * navigator; the rest follow the same window.
 */
const SENSORS: { key: string; label: string; brush?: boolean }[] = [
  { key: 'wind_speed', label: 'Wind speed', brush: true },
  { key: 'temperature', label: 'Temperature' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'dew_point', label: 'Dew point' },
  { key: 'solar', label: 'Solar' },
  { key: 'precipitation', label: 'Precipitation' },
  { key: 'voltage', label: 'Voltage' },
];

export function MetGraphStack({ deviceId }: { deviceId?: string }) {
  if (!deviceId) return <EmptyState title="No MET-LINK device" body="Pair a MET-LINK station to see the sensor graphs." />;
  return (
    <div className="space-y-4">
      {SENSORS.map((s) => (
        <SensorPanel key={s.key} deviceId={deviceId} sensor={s.key} label={s.label} brush={s.brush} />
      ))}
    </div>
  );
}

/**
 * One sensor panel — a single `met/history` call (min/avg/max per 1-min bucket),
 * keyed on the memoized Scope-Bar window (no loop). One axis only (plan §4).
 */
function SensorPanel({
  deviceId,
  sensor,
  label,
  brush,
}: {
  deviceId: string;
  sensor: string;
  label: string;
  brush?: boolean;
}) {
  const { window, scope } = useScope();
  const params = {
    deviceId,
    sensor,
    // "All time" has no lower bound (window.from undefined) → 0, not "last 6h",
    // so the graph honours the range picker instead of silently showing 6h.
    from: window.from ?? 0,
    to: window.to,
    includeDemo: scope.includeDemo,
  };
  const { data, isLoading } = useMetHistory(params);

  // The chart branch supplies its own Card (via ChartFrame); the state branches
  // wear a plain Card so the stack reads consistently.
  if (isLoading) {
    return (
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-medium">{label}</h3>
        <LoadingState label="Loading…" />
      </Card>
    );
  }
  if (!data?.data?.length) {
    return (
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-medium">{label}</h3>
        <EmptyState title="No data in range" body="Widen the date range in the Scope Bar." />
      </Card>
    );
  }
  return (
    <TimeSeriesChart
      title={label}
      data={data.data as unknown as Array<Record<string, number | null>>}
      xKey="timestampMs"
      unit={data.unit}
      height={brush ? 200 : 160}
      brush={brush}
      series={[
        { key: 'avg', label: 'Average', role: 'chart-1' },
        { key: 'min', label: 'Min', role: 'chart-3' },
        { key: 'max', label: 'Max', role: 'chart-6' },
      ]}
      exportName={`met-${sensor}`}
    />
  );
}
