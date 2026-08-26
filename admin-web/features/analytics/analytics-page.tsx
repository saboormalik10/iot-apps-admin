'use client';

import { useDeviceSensors } from '@/lib/hooks/use-device-sensors';
import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { useAnalyticsRealtime } from './use-analytics-realtime';
import { AnalyticsWindRose } from './charts/analytics-wind-rose';
import { MultiSensorChart } from './charts/multi-sensor-chart';
import { StatisticsPanel } from './charts/statistics-panel';
import { WindGustChart } from './charts/wind-gust-chart';
import { ComfortIndicesChart } from './charts/comfort-indices-chart';
import { FogRiskChart } from './charts/fog-risk-chart';
import { PressureTendencyWidget } from './charts/pressure-tendency-widget';

/**
 * MET Analytics Suite (plan §Month 9). The global Scope Bar (device / range /
 * demo) is the filter bar; MET analytics are device-scoped, so when scope is All
 * we auto-select a default MET device. All panels fetch once on load and refetch
 * on socket events via useAnalyticsRealtime — no polling.
 */
export function AnalyticsPage() {
  const met = useScopedDevice('MET-LINK');
  useAnalyticsRealtime();

  if (!met.deviceId || !met.device) {
    return (
      <EmptyState
        title="No MET-LINK device"
        body="The MET analytics suite needs a MET-LINK device. Pair one from the mobile app, or pick one from the device filter above."
      />
    );
  }
  const deviceId = met.deviceId;
  // Comfort, fog risk and pressure tendency are derived from temperature,
  // humidity, dew point and pressure. A wind-only station has none of those, so
  // these three panels rendered permanently empty — three dead cards on the page.
  const sensors = useDeviceSensors(deviceId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {met.isAuto ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{met.device.name}</span> (auto-selected). Use the device
            filter above to choose a device.
          </p>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1 text-xs">
          <Link href="/analytics/met/daily-summary">
            <CalendarRange className="h-3.5 w-3.5" />
            Daily summary
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <AnalyticsWindRose deviceId={deviceId} />
        <div className="space-y-4 xl:col-span-2">
          {sensors.has('pressure') ? <PressureTendencyWidget deviceId={deviceId} /> : null}
          <StatisticsPanel deviceId={deviceId} />
        </div>
      </div>

      <MultiSensorChart deviceId={deviceId} />

      <div className="grid gap-4 xl:grid-cols-2">
        <WindGustChart deviceId={deviceId} />
        {sensors.has('temperature') && sensors.has('humidity') ? <ComfortIndicesChart deviceId={deviceId} /> : null}
      </div>

      {sensors.has('temperature') && sensors.has('dew_point') ? <FogRiskChart deviceId={deviceId} /> : null}
    </div>
  );
}
