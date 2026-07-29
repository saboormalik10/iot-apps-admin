'use client';

import { KpiRow } from './kpi-row';
import { DeviceStatusTable } from './device-status-table';
import { MetDeviceTabs } from './met-device-tabs';
import { NepLiveTile } from './nep-live-tile';
// import { ActiveAlertsPanel } from './active-alerts-panel';   ← alerts disabled
import { FleetMapPanel } from '@/features/maps/fleet-map-panel';
import { useScopedDevice, useEffectiveDeviceType } from './use-scoped-device';
import { useDashboardRealtime } from './use-dashboard-realtime';

/**
 * Dashboard home (plan §Month 8) — the live operations screen. Org-wide surfaces
 * (KPIs, fleet table, fleet map, alerts) honour "All"; device-scoped panels (MET
 * live/wind-rose/history, NEP live) auto-select a default device when scope is All.
 * All live surfaces are wired to the socket via useDashboardRealtime.
 */
export function DashboardHome() {
  const met = useScopedDevice('MET-LINK');
  const nep = useScopedDevice('NEP-LINK');
  useDashboardRealtime({ met: met.deviceId, nep: nep.deviceId });

  // The EFFECTIVE type drives which instrument panels show: the type filter, or —
  // when a single device is picked in "All devices" — that device's own type.
  // A MET scope hides the NEP panels and vice-versa; "All" shows both.
  const effectiveType = useEffectiveDeviceType();
  const showMet = !effectiveType || effectiveType === 'MET-LINK';
  const showNep = !effectiveType || effectiveType === 'NEP-LINK';

  return (
    <div className="space-y-4">
      <KpiRow />

      {/* Alerts are switched off, so the right-hand "Recent alerts" column is
          gone and the live tiles span the full width. To restore, put the panel
          back and return this column to `xl:col-span-2`. */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-3">
          {/* MET instrument dashboard — Live station grid (gauges/thermometers/
              battery/compass + wind rose) and the per-sensor Graphs stack. */}
          {showMet ? <MetDeviceTabs deviceId={met.deviceId} isAuto={met.isAuto} /> : null}
          {showNep ? <NepLiveTile deviceId={nep.deviceId} isAuto={nep.isAuto} /> : null}
        </div>
        {/* <div className="space-y-4">
          <ActiveAlertsPanel />
        </div> */}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DeviceStatusTable />
        <FleetMapPanel compact />
      </div>
    </div>
  );
}
