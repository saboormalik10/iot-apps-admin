'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimeSeriesChart, type SeriesDef } from '@/components/charts/time-series-chart';
import { EmptyState } from '@/components/screen-states';
import type { NepSampleRow } from '@/lib/api/types';

type View = 'turbidity' | 'temperature' | 'both';

// Turbidity blue / temperature orange — mirrors the mobile SessionLineChart (§6.1).
const TURBIDITY: SeriesDef = { key: 'turbidity', label: 'Turbidity (NTU)', role: 'chart-1' };
const TEMPERATURE: SeriesDef = { key: 'temperature', label: 'Temperature (°C)', role: 'chart-8' };

/**
 * Session trend (plan §6.1) — the session's turbidity/temperature over time with a
 * series toggle. Turbidity and temperature share ONE axis only in the "both" view
 * as a shape comparison; they are the same magnitude class here (both small), and
 * the single-value views are the default. Nulls render as gaps (§10.2).
 */
export function SessionTrendChart({ samples }: { samples: NepSampleRow[] }) {
  const [view, setView] = useState<View>('turbidity');
  const hasTemp = samples.some((s) => s.temperatureValue != null);

  const rows = useMemo(
    () =>
      samples.map((s) => ({
        timestamp: s.timestamp,
        turbidity: s.turbidityValue,
        temperature: s.temperatureValue,
      })),
    [samples],
  );

  if (samples.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="No samples" body="This session has no readings to plot." />
      </Card>
    );
  }

  const series = view === 'turbidity' ? [TURBIDITY] : view === 'temperature' ? [TEMPERATURE] : [TURBIDITY, TEMPERATURE];
  const unit = view === 'turbidity' ? 'NTU' : view === 'temperature' ? '°C' : 'NTU / °C';

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="group" aria-label="Trend series">
        {(['turbidity', 'temperature', 'both'] as View[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? 'default' : 'outline'}
            className="h-7 text-xs capitalize"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            disabled={v !== 'turbidity' && !hasTemp}
          >
            {v}
          </Button>
        ))}
      </div>
      <TimeSeriesChart data={rows} series={series} xKey="timestamp" title="Session trend" unit={unit} exportName="session-trend" />
    </div>
  );
}
