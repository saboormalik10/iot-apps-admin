'use client';

import { WindRose } from '@/components/charts/wind-rose';
import { ChartFrame } from '@/components/charts/chart-frame';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useMetWindRose } from '../use-analytics';

/**
 * Rich MET wind rose over the whole Scope-Bar window. The backend returns the
 * pre-aggregated 16-sector × 5-band matrix, which we hand straight to the shared
 * WindRose primitive (no client-side re-bucketing of a huge sample set).
 */
export function AnalyticsWindRose({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useMetWindRose(deviceId);

  if (isLoading) {
    return (
      <ChartFrame title="Wind rose">
        <LoadingState label="Loading wind rose…" />
      </ChartFrame>
    );
  }
  if (!data || !data.sectors?.length || !data.totalSamples) {
    return (
      <ChartFrame title="Wind rose">
        <EmptyState title="No wind data in range" body="Widen the date range or pick a device with wind data." />
      </ChartFrame>
    );
  }

  const matrix = data.sectors.map((s) => (s.speedBuckets ?? []).map((b) => b.count));
  return <WindRose matrix={matrix} title={`Wind rose · ${data.totalSamples.toLocaleString()} samples`} exportName="met-wind-rose" />;
}
