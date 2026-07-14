'use client';

import { Card } from '@/components/ui/card';
import { StackedBar, type StackSeries } from '@/components/charts/stacked-bar';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useNepProbeBreakdown } from '../use-nep-analytics';

const fmtDate = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** R1/R2/R3 in fixed ordinal colours (rising turbidity range) — §4 categorical. */
const SERIES: StackSeries[] = [
  { key: 'r1Count', label: 'R1 (<10 NTU)', role: 'seq-2' },
  { key: 'r2Count', label: 'R2 (10–1000)', role: 'seq-4' },
  { key: 'r3Count', label: 'R3 (>1000)', role: 'seq-5' },
];

/**
 * Probe-range breakdown (plan §6) — daily stacked bar of samples by the derived
 * probe range R1/R2/R3, showing how the turbidity regime shifts over time.
 */
export function ProbeRangeBreakdown({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useNepProbeBreakdown(deviceId);

  if (isLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading probe-range breakdown…" />
      </Card>
    );
  }
  if (!data || data.data.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No probe-range data" body="No samples in this scope to break down by probe range." />
      </Card>
    );
  }

  // Map to inline object literals so TS grants the implicit index signature StackedBar's generic needs.
  const rows = data.data.map((d) => ({ date: d.date, r1Count: d.r1Count, r2Count: d.r2Count, r3Count: d.r3Count }));

  return (
    <StackedBar
      data={rows}
      xKey="date"
      series={SERIES}
      title="Probe-range breakdown"
      unit="samples/day"
      xFormatter={(v) => fmtDate(String(v))}
      exportName="probe-range-breakdown"
    />
  );
}
