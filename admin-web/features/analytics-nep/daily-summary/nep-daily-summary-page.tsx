'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/charts/stat-tile';
import { CalendarHeatmap, type CalendarCell } from '@/components/charts/calendar-heatmap';
import { RangeBandChart, type RangeBandRow } from '@/components/charts/range-band-chart';
import { StackedBar, type StackSeries } from '@/components/charts/stacked-bar';
import { useNepDailySummary } from '../use-nep-analytics';
import { useNepAnalyticsRealtime } from '../use-nep-analytics-realtime';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const PROBE_SERIES: StackSeries[] = [
  { key: 'r1SampleCount', label: 'R1 (<10 NTU)', role: 'seq-2' },
  { key: 'r2SampleCount', label: 'R2 (10–1000)', role: 'seq-4' },
  { key: 'r3SampleCount', label: 'R3 (>1000)', role: 'seq-5' },
];

/**
 * NEP daily-summary suite (plan §6, §10.7). Device-scoped daily rollups: a sampling-
 * activity calendar, daily turbidity + temperature min–max bands with a mean line,
 * and a daily probe-range stacked bar. Fetch once; refetch on socket events.
 */
export function NepDailySummaryPage() {
  const nep = useScopedDevice('NEP-LINK');
  useNepAnalyticsRealtime();
  const { data, isLoading } = useNepDailySummary(nep.deviceId);

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
      <Link href="/analytics/nep">
        <ArrowLeft className="h-3.5 w-3.5" />
        NEP Analytics
      </Link>
    </Button>
  );

  if (!nep.deviceId || !nep.device) {
    return (
      <div className="space-y-3">
        {backLink}
        <EmptyState title="No NEP-LINK device" body="The daily-summary suite needs a NEP-LINK device. Adjust the Scope Bar." />
      </div>
    );
  }

  const rows = data ?? [];
  const totalSessions = rows.reduce((a, r) => a + r.sessionCount, 0);
  const totalSamples = rows.reduce((a, r) => a + r.totalSamples, 0);
  const compliantDays = rows.filter((r) => r.drinkingCompliant).length;

  const activityCells: CalendarCell[] = rows.map((r) => ({ dateMs: r.dateMs, value: r.totalSamples }));
  const turbidityRows: RangeBandRow[] = rows.map((r) => ({
    label: fmtDate(r.dateMs),
    min: r.turbidityMin,
    max: r.turbidityMax,
    mean: r.turbidityAvg,
  }));
  const tempRows: RangeBandRow[] = rows.map((r) => ({
    label: fmtDate(r.dateMs),
    min: r.temperatureMin,
    max: r.temperatureMax,
    mean: r.temperatureAvg,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {backLink}
        {nep.isAuto ? (
          <span className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{nep.device.name}</span> (auto-selected)
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Loading daily summaries…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No daily summaries yet"
          body="Daily rollups populate as sessions close (or run the backfill script). Try widening the date range."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Days" value={rows.length} />
            <StatTile label="Sessions" value={totalSessions} />
            <StatTile label="Samples" value={totalSamples.toLocaleString()} />
            <StatTile label="WHO-compliant days" value={`${compliantDays}/${rows.length}`} />
          </div>

          <CalendarHeatmap
            cells={activityCells}
            title="Daily sampling activity"
            subtitle="samples per day"
            role="chart-2"
            formatValue={(v) => `${Math.round(v).toLocaleString()} samples`}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <RangeBandChart rows={turbidityRows} title="Turbidity" unit="NTU" role="chart-2" exportName="nep-daily-turbidity" />
            <RangeBandChart rows={tempRows} title="Temperature" unit="°C" role="chart-1" exportName="nep-daily-temperature" />
          </div>

          <StackedBar
            data={rows.map((r) => ({ date: fmtDate(r.dateMs), r1SampleCount: r.r1SampleCount, r2SampleCount: r.r2SampleCount, r3SampleCount: r.r3SampleCount }))}
            xKey="date"
            series={PROBE_SERIES}
            title="Probe-range mix"
            unit="samples/day"
            exportName="nep-daily-probe-range"
          />
        </>
      )}
    </div>
  );
}
