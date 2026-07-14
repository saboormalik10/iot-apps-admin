'use client';

import { Card } from '@/components/ui/card';
import { Histogram, type HistogramBar } from '@/components/charts/histogram';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { NTU_CLASSES, cssVar } from '@/lib/api/scales';
import { useNepTurbidityDistribution } from '../use-nep-analytics';

/**
 * Turbidity distribution histogram (plan §6) — sample counts across the 7 WHO/EPA
 * NTU classes. Each bar is coloured by its class role from our validated ramp
 * (§10.9 — never the backend hex). The classes double as the reference bands, so
 * a legend spells out what each range means.
 */
export function TurbidityDistribution({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useNepTurbidityDistribution(deviceId);

  if (isLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading turbidity distribution…" />
      </Card>
    );
  }
  if (!data || data.totalSamples === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No turbidity samples" body="No readings in this scope. Widen the date range or include demo data." />
      </Card>
    );
  }

  // Backend buckets are already ordered by class; map each onto its validated role.
  const bars: HistogramBar[] = data.buckets.map((b, i) => ({
    label: b.label,
    value: b.count,
    role: NTU_CLASSES[i]?.role ?? 'seq-4',
    meta: b.waterQualityClass,
  }));

  return (
    <div className="space-y-3">
      <Histogram
        bars={bars}
        title="Turbidity distribution"
        unit="NTU classes"
        valueLabel="Samples"
        exportName="turbidity-distribution"
      />
      <Card className="p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          {data.totalSamples.toLocaleString()} samples · WHO/EPA water-quality classes
        </p>
        <ul className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
          {data.buckets.map((b, i) => (
            <li key={b.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: cssVar(NTU_CLASSES[i]?.role ?? 'seq-4') }} />
              <span className="font-medium tabular-nums">{b.label}</span>
              <span className="text-muted-foreground">{b.waterQualityClass}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{b.pct}%</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
