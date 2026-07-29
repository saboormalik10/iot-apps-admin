'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useScope } from '@/lib/hooks/use-scope';
import type { MetHistorySeries } from '@/lib/api/types';
import { useMetHistoryMulti } from './use-dashboard';

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

const SENSOR_KEYS = SENSORS.map((s) => s.key);

export function MetGraphStack({ deviceId }: { deviceId?: string }) {
  const { window, scope } = useScope();

  // ONE request for the whole stack — server-aggregated (min/avg/max per adaptive
  // bucket) so the browser never fetches raw rows or bins anything itself, and
  // never makes 8 round-trips for 8 charts.
  const { data, isLoading } = useMetHistoryMulti(
    deviceId
      ? {
          deviceId,
          sensors: SENSOR_KEYS,
          // "All time" has no lower bound (window.from undefined) → 0, so the
          // graph honours the range picker instead of silently showing 6h.
          from: window.from ?? 0,
          to: window.to,
          demoOnly: scope.demoOnly,
        }
      : undefined,
  );

  if (!deviceId) return <EmptyState title="No MET-LINK device" body="Pair a MET-LINK station to see the sensor graphs." />;

  return (
    <div className="space-y-4">
      {SENSORS.map((s) => (
        <InViewport key={s.key} minHeight={s.brush ? 236 : 200}>
          <SensorPanel series={data?.series?.[s.key]} isLoading={isLoading} sensor={s.key} label={s.label} brush={s.brush} />
        </InViewport>
      ))}
    </div>
  );
}

/**
 * One sensor panel — reads its slice from the single `met/history-multi` payload
 * (min/avg/max per adaptive bucket). No per-panel fetch, no client aggregation.
 */
function SensorPanel({
  series,
  isLoading,
  sensor,
  label,
  brush,
}: {
  series?: MetHistorySeries;
  isLoading: boolean;
  sensor: string;
  label: string;
  brush?: boolean;
}) {
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
  if (!series?.data?.length) {
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
      data={series.data as unknown as Array<Record<string, number | null>>}
      xKey="timestampMs"
      unit={series.unit}
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

/**
 * Defers mounting its children until they scroll near the viewport, so the eight
 * Recharts charts don't all lay out on first paint (only ~2–3 are visible). The
 * data is already loaded once above; this is purely a rendering optimization.
 */
function InViewport({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div ref={ref} style={{ minHeight: shown ? undefined : minHeight }}>
      {shown ? children : null}
    </div>
  );
}
