'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FleetMapPanel } from './fleet-map-panel';
import { GpsDensityPanel } from './gps-density-panel';

/**
 * Maps page (plan §Month 8 fleet map + §Month 10 GPS density). Two views: the org
 * fleet map (status-coloured markers, live) and the NEP GPS-density heatmap
 * (grid-cell turbidity averages), both under the global Scope Bar.
 */
export function MapsTabs() {
  return (
    <Tabs defaultValue="fleet" className="space-y-4">
      <TabsList>
        <TabsTrigger value="fleet">Fleet map</TabsTrigger>
        <TabsTrigger value="density">GPS density</TabsTrigger>
      </TabsList>
      <TabsContent value="fleet">
        <FleetMapPanel />
      </TabsContent>
      <TabsContent value="density">
        <GpsDensityPanel />
      </TabsContent>
    </Tabs>
  );
}
