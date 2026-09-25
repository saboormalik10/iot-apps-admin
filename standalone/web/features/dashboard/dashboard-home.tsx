'use client';

import { KpiRow } from './kpi-row';
import { DeviceStatusTable } from './device-status-table';
import { MetDeviceTabs } from './met-device-tabs';
// import { ActiveAlertsPanel } from './active-alerts-panel';   ← alerts disabled
import { useScopedDevice } from './use-scoped-device';
import { useDashboardRealtime } from './use-dashboard-realtime';

/**
 * Dashboard home (plan §Month 8) — the live operations screen. Org-wide surfaces
 * (KPIs, station table) honour "All"; the station panels (live/wind-rose/history)
 * auto-select the station when scope is All. All live surfaces are wired to the
 * socket via useDashboardRealtime.
 */
export function DashboardHome() {
  const met = useScopedDevice('MET-LINK');
  useDashboardRealtime({ met: met.deviceId });

  return (
    <div className="space-y-4">
      {/* The dashboard's visual design has no page title, but a route with no h1
          leaves screen-reader users with no top of the outline to land on — and
          every card heading below is an h2. Visually hidden, structurally real. */}
      <h1 className="sr-only">Dashboard</h1>
      <KpiRow />

      {/* Alerts are switched off, so the right-hand "Recent alerts" column is
          gone and the live tiles span the full width. To restore, put the panel
          back and return this column to `xl:col-span-2`. */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* `min-w-0`: a grid item will not shrink below its content unless told
            to, so one wide instrument inside made this column — and with it the
            page — wider than a 375px screen (QA, 25 Sep 2026). */}
        <div className="min-w-0 space-y-4 xl:col-span-3">
          {/* MET instrument dashboard — Live station grid (gauges/thermometers/
              battery/compass + wind rose) and the per-sensor Graphs stack. */}
          <MetDeviceTabs deviceId={met.deviceId} isAuto={met.isAuto} />
        </div>
        {/* <div className="space-y-4">
          <ActiveAlertsPanel />
        </div> */}
      </div>

      <DeviceStatusTable />
    </div>
  );
}
