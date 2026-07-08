'use client';

import { Wind, Thermometer, Droplets, Gauge, Sun, CloudRain, Zap, Navigation } from 'lucide-react';
import type { MetLatest } from '@/lib/api/types';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/charts/stat-tile';
import { BeaufortBadge } from '@/components/charts/beaufort-scale';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt, COMPASS_16, sectorIndex } from '@/components/charts/chart-utils';
import { useMetLatest } from './use-dashboard';

/**
 * Live MET sensor tiles (plan §6) — the full sensor snapshot (wind true/rel, temp,
 * humidity, pressure, solar, precip, dew point, power), pushed via `met:latest`.
 * Null sensors render an en-dash gap, never a fabricated 0 (§10.2).
 */
export function MetLiveTiles({ deviceId, isAuto }: { deviceId?: string; isAuto?: boolean }) {
  const { data, isLoading } = useMetLatest(deviceId);

  if (!deviceId) return <EmptyState title="No MET-LINK device" body="Pair a MET-LINK station to see live weather." />;
  if (isLoading) return <LoadingState label="Loading live weather…" />;
  if (!data) return <EmptyState title="No live MET data" body="This device has not reported measurements yet." />;

  const dir = data.windDirTrueDeg;
  const compass = dir != null ? COMPASS_16[sectorIndex(dir)] : '–';

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Live weather · {data.deviceName}
          {isAuto ? <span className="ml-2 text-xs font-normal text-muted-foreground">(auto-selected)</span> : null}
        </h3>
        <BeaufortBadge windMs={data.windSpeedMs} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric icon={<Wind />} label="Wind (true)" value={fmt(data.windSpeedMs, 1)} unit="m/s" sub={`${compass} ${dir != null ? `${Math.round(dir)}°` : ''}`} />
        <Metric icon={<Navigation />} label="Wind (rel)" value={fmt(data.windDirRelDeg, 0)} unit="°" />
        <Metric icon={<Thermometer />} label="Temp" value={fmt(data.tempC, 1)} unit="°C" />
        <Metric icon={<Droplets />} label="Humidity" value={fmt(data.humidityPct, 0)} unit="%" />
        <Metric icon={<Gauge />} label="Pressure" value={fmt(data.pressureHpa, 1)} unit="hPa" />
        <Metric icon={<Sun />} label="Solar" value={fmt(data.solarWm2, 0)} unit="W/m²" />
        <Metric icon={<CloudRain />} label="Precip" value={fmt(data.precipMm, 1)} unit="mm" />
        <Metric icon={<Thermometer />} label="Dew point" value={fmt(data.dewPointC, 1)} unit="°C" />
        <Metric icon={<Zap />} label="Voltage" value={fmt(data.voltageV, 2)} unit="V" />
      </div>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sub?: string;
}) {
  return (
    <StatTile
      label={label}
      value={
        <span className="flex items-baseline gap-1">
          {value}
          <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        </span>
      }
      sub={sub}
      icon={<span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
    />
  );
}
