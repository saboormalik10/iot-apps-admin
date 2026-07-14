'use client';

import { Card } from '@/components/ui/card';
import { RangeBandChart, type RangeBandRow } from '@/components/charts/range-band-chart';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useNepCrossSessionTrend } from '../use-nep-analytics';

const fmtDate = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * Cross-session daily turbidity trend (plan §6) — the device's daily min–max
 * turbidity band with a mean line, aggregated across every session in the window.
 */
export function CrossSessionTrend({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useNepCrossSessionTrend(deviceId);

  if (isLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading cross-session trend…" />
      </Card>
    );
  }
  if (!data || data.data.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No cross-session trend" body="No sessions in this scope. Widen the date range." />
      </Card>
    );
  }

  const rows: RangeBandRow[] = data.data.map((d) => ({
    label: fmtDate(d.date),
    min: d.minTurbidity,
    max: d.maxTurbidity,
    mean: d.avgTurbidity,
  }));

  return <RangeBandChart rows={rows} title="Daily turbidity trend" unit="NTU" role="chart-2" exportName="nep-cross-session-trend" />;
}
