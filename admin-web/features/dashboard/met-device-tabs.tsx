'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetStationLive } from './met-station-live';
import { MetGraphStack } from './met-graph-stack';

/**
 * MET device view (gap-analysis item 5–6) — the tabbed instrument dashboard,
 * mirroring the mobile app's "rose or graph" layout modes (plan §6.1). `Live` is
 * the curated station grid (gauges/thermometers/battery/compass + wind rose);
 * `Graphs` is the per-sensor small-multiples stack with a brush on the primary
 * chart. Both are fed by the live `met/latest` / `met/history` data we already
 * consume — no polling, no backend change.
 */
export function MetDeviceTabs({ deviceId, isAuto }: { deviceId?: string; isAuto?: boolean }) {
  return (
    <Tabs defaultValue="live" className="space-y-4">
      <TabsList>
        <TabsTrigger value="live">Live</TabsTrigger>
        <TabsTrigger value="graphs">Graphs</TabsTrigger>
      </TabsList>
      <TabsContent value="live">
        <MetStationLive deviceId={deviceId} isAuto={isAuto} />
      </TabsContent>
      <TabsContent value="graphs">
        <MetGraphStack deviceId={deviceId} />
      </TabsContent>
    </Tabs>
  );
}
