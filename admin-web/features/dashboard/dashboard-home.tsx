'use client';

import { KpiRow } from './kpi-row';
import { DeviceStatusTable } from './device-status-table';
import { MetLiveTiles } from './met-live-tiles';
import { NepLiveTile } from './nep-live-tile';
import { WindRosePanel } from './wind-rose-panel';
import { MetHistoryPanel } from './met-history-panel';
import { ActiveAlertsPanel } from './active-alerts-panel';
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

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {showMet ? <MetLiveTiles deviceId={met.deviceId} isAuto={met.isAuto} /> : null}
          {showMet ? <MetHistoryPanel deviceId={met.deviceId} /> : null}
          {showNep ? <NepLiveTile deviceId={nep.deviceId} isAuto={nep.isAuto} /> : null}
        </div>
        <div className="space-y-4">
          {showMet ? <WindRosePanel deviceId={met.deviceId} /> : null}
          <ActiveAlertsPanel />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DeviceStatusTable />
        <FleetMapPanel compact />
      </div>
    </div>
  );
}
