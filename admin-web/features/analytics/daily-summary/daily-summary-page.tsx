'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { useMetDailySummary } from '../use-analytics';
import { useAnalyticsRealtime } from '../use-analytics-realtime';
import { CompletenessHeatmap } from './completeness-heatmap';
import { PrevailingWind } from './prevailing-wind';
import { BeaufortDistribution } from './beaufort-distribution';
import { RangeBandCharts } from './range-band-charts';
import { SolarPrecipBars } from './solar-precip-bars';

/**
 * MET daily-summary suite (plan §6, §10.7). Device-scoped daily rollups: a data-
 * completeness calendar, prevailing-wind compass, Beaufort distribution, per-sensor
 * min–max bands, and solar/precip day bars. Fetch once on load; refetch on socket.
 */
export function DailySummaryPage() {
  const met = useScopedDevice('MET-LINK');
  useAnalyticsRealtime();
  const { data, isLoading } = useMetDailySummary(met.deviceId);

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
      <Link href="/analytics">
        <ArrowLeft className="h-3.5 w-3.5" />
        Analytics
      </Link>
    </Button>
  );

  if (!met.deviceId || !met.device) {
    return (
      <div className="space-y-3">
        {backLink}
        <EmptyState title="No MET-LINK device" body="The daily-summary suite needs a MET-LINK device. Adjust the Scope Bar." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {backLink}
        {met.isAuto ? (
          <span className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{met.device.name}</span> (auto-selected)
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Loading daily summaries…" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No daily summaries yet"
          body="Daily rollups populate as sessions close (or run the backfill script). Try widening the date range."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CompletenessHeatmap summaries={data} />
            </div>
            <PrevailingWind summaries={data} />
          </div>
          <BeaufortDistribution summaries={data} />
          <RangeBandCharts summaries={data} />
          <SolarPrecipBars summaries={data} />
        </>
      )}
    </div>
  );
}
