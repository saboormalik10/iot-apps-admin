'use client';

import { AlertTriangle, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { NTU_CLASSES, ntuClassIndex, cssVar } from '@/lib/api/scales';
import { fmt } from '@/components/charts/chart-utils';
import { useNepSessionEvents } from '@/features/analytics-nep/use-nep-analytics';

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Session events (plan §6) — turbidity-spike events detected within the session
 * (runs above 150% of the session mean, by default). Each event shows its peak
 * (coloured by WHO/EPA class), mean, duration and GPS centroid.
 */
export function SessionEventsPanel({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useNepSessionEvents(sessionId);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Turbidity events
        </h3>
        {data ? (
          <span className="text-xs text-muted-foreground">
            {data.events.length} event{data.events.length === 1 ? '' : 's'} · threshold {fmt(data.threshold, 0)} NTU
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Detecting events…" />
      ) : !data || data.events.length === 0 ? (
        <EmptyState title="No turbidity spikes" body="No readings rose far enough above the session mean to flag an event." />
      ) : (
        <ul className="space-y-2">
          {data.events.map((e, i) => {
            const role = NTU_CLASSES[ntuClassIndex(e.peakNtu)].role;
            return (
              <li key={i} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: cssVar(role) }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-medium tabular-nums">peak {fmt(e.peakNtu, 0)} NTU</span>
                    <span className="text-xs text-muted-foreground tabular-nums">mean {fmt(e.meanNtu, 0)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(e.durationMin, 1)} min</span>
                    {e.probeRange ? <span className="text-xs text-muted-foreground">{e.probeRange}</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmtTime(e.eventStart)} – {fmtTime(e.eventEnd)}
                    {e.gpsCentroid ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {fmt(e.gpsCentroid.lat, 4)}, {fmt(e.gpsCentroid.lng, 4)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
