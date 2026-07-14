'use client';

import { Card } from '@/components/ui/card';
import { ScatterChart } from '@/components/charts/scatter-chart';
import { StatusBadge, type StatusTone } from '@/components/charts/status-badge';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt } from '@/components/charts/chart-utils';
import { useNepCorrelation } from '../use-nep-analytics';

const SIG_TONE: Record<string, StatusTone> = { strong: 'ok', moderate: 'warn', weak: 'info', none: 'offline' };

/**
 * Turbidity ↔ temperature correlation (plan §6) — a scatter of every paired
 * reading with a least-squares trend line and a Pearson-r annotation (with the
 * backend's significance/interpretation). Temperature on X, turbidity on Y.
 */
export function CorrelationScatter({ deviceId, sessionId }: { deviceId?: string; sessionId?: string }) {
  const { data, isLoading } = useNepCorrelation(deviceId, sessionId);

  if (isLoading) {
    return (
      <Card className="p-4">
        <LoadingState label="Loading correlation…" />
      </Card>
    );
  }
  if (!data || data.scatterPoints.length < 2) {
    return (
      <Card className="p-4">
        <EmptyState title="Not enough paired readings" body="Turbidity↔temperature correlation needs samples with both values." />
      </Card>
    );
  }

  const points = data.scatterPoints.map((p) => ({ x: p.tempC, y: p.ntu }));
  const rLabel =
    data.pearsonR == null
      ? 'r = —'
      : `r = ${fmt(data.pearsonR, 2)} · ${data.significance} ${data.trend !== 'none' ? data.trend : ''}`.trim();

  return (
    <div className="space-y-2">
      <ScatterChart
        points={points}
        xLabel="Temperature"
        yLabel="Turbidity"
        xUnit="°C"
        yUnit="NTU"
        title="Turbidity ↔ temperature"
        role="chart-2"
        annotation={<StatusBadge tone={SIG_TONE[data.significance] ?? 'offline'} label={rLabel} />}
        exportName="turbidity-temp-correlation"
      />
      <p className="px-1 text-xs text-muted-foreground">
        {data.interpretation} <span className="tabular-nums">({data.sampleCount.toLocaleString()} paired samples{data.rSquared != null ? `, R² = ${fmt(data.rSquared, 2)}` : ''})</span>
      </p>
    </div>
  );
}
