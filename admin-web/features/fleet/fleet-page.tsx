'use client';

import { FleetHealthTable } from './fleet-health-table';
import { DeviceComparisonPanel } from './device-comparison-panel';

/**
 * Fleet rollups (plan §Month 10) — the two org-wide cross-device views:
 * fleet-health (per-device status/battery/usage/storage) and a device-comparison
 * overlay (one MET sensor across up to 5 devices).
 */
export function FleetPage() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Fleet health</h2>
        <FleetHealthTable />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Device comparison</h2>
        <DeviceComparisonPanel />
      </section>
    </div>
  );
}
