'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudRain } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Gauge, type GaugeBand } from '@/components/charts/gauge';
import { Thermometer } from '@/components/charts/thermometer';
import { BatteryGauge } from '@/components/charts/battery-gauge';
import { CompassTile } from '@/components/charts/compass-tile';
import { StatTile } from '@/components/charts/stat-tile';
import { BeaufortBadge } from '@/components/charts/beaufort-scale';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt } from '@/components/charts/chart-utils';
import { WindRosePanel } from './wind-rose-panel';
import { DataFreshness } from './data-freshness';
import { useMetLatest } from './use-dashboard';
import { PresetMenu } from './presets/preset-menu';
import { useDashboardLayouts } from './presets/use-layouts';
import { ALL_WIDGET_KEYS, tilesToKeys } from './presets/tile-catalog';

/** Pressure threshold bands (hPa) — low/normal/high on the reserved status roles. */
const PRESSURE_BANDS: GaugeBand[] = [
  { from: 950, to: 1000, role: 'status-warn', label: 'Low' },
  { from: 1000, to: 1025, role: 'status-ok', label: 'Normal' },
  { from: 1025, to: 1050, role: 'status-info', label: 'High' },
];

/** Wind-speed threshold bands (km/h) — the 4 Parklife bands, mapped to sequential roles. */
const WIND_BANDS: GaugeBand[] = [
  { from: 0, to: 25, role: 'seq-1' },
  { from: 25, to: 50, role: 'seq-3' },
  { from: 50, to: 75, role: 'seq-4' },
  { from: 75, to: 100, role: 'seq-5' },
];

/**
 * MET station "Live" view (plan §5.5 / gap-analysis item 5) — the curated
 * instrument grid mirroring the Parklife station overview: radial gauges (wind
 * speed, humidity, pressure), thermometers (temp, dew point), a battery gauge (DC
 * voltage), a compass (wind direction), the wind rose, and big-number tiles
 * (precip total/intensity). Fed by the live `met:latest` push via `useMetLatest`
 * (no polling). Null sensors render empty widgets, never a fabricated 0 (§10.2).
 *
 * Which tiles are shown is a per-device, per-user "saved view" (§Month 11): the
 * PresetMenu toggles visibility and persists named presets via `dashboard-layouts`.
 * Default is ALL tiles (zero change unless a view is saved/applied).
 */
export function MetStationLive({ deviceId, isAuto }: { deviceId?: string; isAuto?: boolean }) {
  const { data, isLoading } = useMetLatest(deviceId);
  const { data: layouts } = useDashboardLayouts(deviceId);

  const [visibleKeys, setVisibleKeys] = useState<string[]>(ALL_WIDGET_KEYS);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  // Auto-apply the device's default saved view exactly once per device.
  const autoAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deviceId || !layouts) return;
    if (autoAppliedFor.current === deviceId) return;
    autoAppliedFor.current = deviceId;
    const def = layouts.find((l) => l.isDefault);
    if (def) {
      setVisibleKeys(tilesToKeys(def.tiles));
      setAppliedId(def._id);
    } else {
      setVisibleKeys(ALL_WIDGET_KEYS);
      setAppliedId(null);
    }
  }, [deviceId, layouts]);

  if (!deviceId) return <EmptyState title="No MET-LINK device" body="Pair a MET-LINK station to see the live dashboard." />;
  if (isLoading) return <LoadingState label="Loading live station…" />;
  if (!data) return <EmptyState title="No live MET data" body="This device has not reported measurements yet." />;

  const show = (key: string) => visibleKeys.includes(key);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium">
              Live station · {data.deviceName}
              {isAuto ? <span className="ml-2 text-xs font-normal text-muted-foreground">(auto-selected)</span> : null}
            </h3>
            <DataFreshness tsMs={data.measuredAtMs} />
          </div>
          <div className="flex items-center gap-2">
            <BeaufortBadge windMs={data.windSpeedMs} />
            <PresetMenu
              deviceId={deviceId}
              visibleKeys={visibleKeys}
              onChange={setVisibleKeys}
              appliedId={appliedId}
              onApplied={setAppliedId}
            />
          </div>
        </div>

        {/* Instrument grid — gauges + thermometers + battery + compass. */}
        <div className="grid grid-cols-2 items-end gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {show('wind_speed') ? (
            <Widget>
              <Gauge value={data.windSpeedKmh} min={0} max={100} label="Wind speed" unit="km/h" valueRole="seq-3" bands={WIND_BANDS} />
            </Widget>
          ) : null}
          {show('humidity') ? (
            <Widget>
              <Gauge value={data.humidityPct} min={0} max={100} label="Humidity" unit="%" valueRole="seq-2" digits={0} />
            </Widget>
          ) : null}
          {show('pressure') ? (
            <Widget>
              <Gauge value={data.pressureHpa} min={950} max={1050} label="Pressure" unit="hPa" valueRole="seq-4" bands={PRESSURE_BANDS} />
            </Widget>
          ) : null}
          {show('solar') ? (
            <Widget>
              <Gauge value={data.solarWm2} min={0} max={1200} label="Solar" unit="W/m²" valueRole="chart-3" digits={0} />
            </Widget>
          ) : null}
          {show('temperature') ? (
            <Widget>
              <Thermometer value={data.tempC} min={-10} max={50} label="Temperature" />
            </Widget>
          ) : null}
          {show('dew_point') ? (
            <Widget>
              <Thermometer value={data.dewPointC} min={-10} max={30} label="Dew point" />
            </Widget>
          ) : null}
          {show('wind_dir') ? (
            <Widget>
              <CompassTile deg={data.windDirTrueDeg} label="Wind direction" />
            </Widget>
          ) : null}
          {show('battery') ? (
            <Widget>
              <BatteryGauge value={data.voltageV ?? data.batteryVoltageV} min={10} max={15} label="DC voltage" />
            </Widget>
          ) : null}
        </div>

        {/* Precipitation big-number tiles. */}
        {show('precip_total') || show('precip_rate') ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {show('precip_total') ? (
              <StatTile
                label="Total precip"
                icon={<span className="[&_svg]:h-4 [&_svg]:w-4"><CloudRain /></span>}
                value={<Value v={data.precipMm} unit="mm" />}
              />
            ) : null}
            {show('precip_rate') ? (
              <StatTile
                label="Precip intensity"
                icon={<span className="[&_svg]:h-4 [&_svg]:w-4"><CloudRain /></span>}
                value={<Value v={data.precipRateMmHr} unit="mm/h" />}
              />
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* Wind rose — the signature polar chart (already owned). */}
      {deviceId ? (
        <Card className="p-4">
          <WindRosePanel deviceId={deviceId} />
        </Card>
      ) : null}
    </div>
  );
}

function Widget({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center">{children}</div>;
}

function Value({ v, unit }: { v: number | null; unit: string }) {
  return (
    <span className="flex items-baseline gap-1">
      {fmt(v, 2)}
      <span className="text-sm font-normal text-muted-foreground">{unit}</span>
    </span>
  );
}
