'use client';

import { Droplets } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge, type StatusTone } from '@/components/charts/status-badge';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { NTU_CLASSES, ntuClassIndex, cssVar } from '@/lib/api/scales';
import { fmt } from '@/components/charts/chart-utils';
import { useNepWaterQuality } from '../use-nep-analytics';

/** WHO/EPA class index → a reserved status tone (icon + label always accompany it). */
function toneForNtuClass(index: number): StatusTone {
  if (index <= 1) return 'ok'; // WHO drinking / EPA recreational
  if (index <= 3) return 'warn'; // slightly / moderately turbid
  return 'error'; // turbid → extreme
}
const EPA_TONE: Record<'safe' | 'caution' | 'unsafe', StatusTone> = { safe: 'ok', caution: 'warn', unsafe: 'error' };

/**
 * Water-quality summary badge (plan §6) — the WHO/EPA 7-tier verdict for a session,
 * mapped onto our validated status/sequential ramp (§10.9). Shows the ISO class,
 * WHO drinking compliance, EPA recreational safety, and the NTU range.
 */
export function WaterQualityBadge({ sessionId }: { sessionId?: string }) {
  const { data, isLoading } = useNepWaterQuality(sessionId);

  if (!sessionId) return null;
  if (isLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading water quality…" />
      </Card>
    );
  }
  if (!data || data.avgNtu == null) {
    return (
      <Card className="p-4">
        <EmptyState title="No water-quality reading" body="The latest session has no turbidity average yet." />
      </Card>
    );
  }

  const idx = ntuClassIndex(data.avgNtu);
  const cls = NTU_CLASSES[idx];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Droplets className="h-4 w-4 text-muted-foreground" />
          Water quality
        </h3>
        {data.probeRange ? <span className="text-xs text-muted-foreground">Probe {data.probeRange}</span> : null}
      </div>

      <div className="flex items-end gap-3">
        <span className="text-3xl font-semibold tabular-nums leading-none">{fmt(data.avgNtu, 1)}</span>
        <span className="pb-0.5 text-xs text-muted-foreground">avg NTU</span>
        <span
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ background: cssVar(cls.role) }}
        >
          {data.isoLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge
          tone={data.who.compliant ? 'ok' : toneForNtuClass(idx)}
          label={data.who.compliant ? `WHO drinking compliant (<${data.who.threshold} NTU)` : `Above WHO drinking (${data.who.threshold} NTU)`}
        />
        <StatusBadge
          tone={EPA_TONE[data.epa.recreational]}
          label={`EPA recreational: ${data.epa.recreational} (${data.epa.threshold} NTU)`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Min</div>
          <div className="tabular-nums">{fmt(data.minNtu, 1)} NTU</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Max</div>
          <div className="tabular-nums">{fmt(data.maxNtu, 1)} NTU</div>
        </div>
      </div>
    </Card>
  );
}
