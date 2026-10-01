'use client';

import { useEffect, useState } from 'react';
import type { ExceedanceBand } from '@/lib/api/types';
import { corridorExceedance } from '@/lib/api/endpoints';
import { BandTimeline } from '@/components/charts/band-timeline';
import { ChartFrame } from '@/components/charts/chart-frame';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtDuration, fmtTime } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';

/** The last day across the whole corridor — see BandTimeline for why. */
export function ExceedancePanel() {
  const now = useDemoClock();
  const revision = useDataRevision();
  /* Fixed at the last day. A range picker inside one chart card would scope that
     chart differently from everything around it; the full history, with its
     own date controls, is the History screen. */
  const hours = 24;
  const [data, setData] = useState<{ from: number; to: number; bands: ExceedanceBand[] } | null>(null);
  const fiveMin = Math.floor(now / 300_000);

  useEffect(() => {
    if (!now) return;
    corridorExceedance(hours).then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiveMin, revision]);

  const rows = STATIONS.map((s) => ({ id: s.id, label: `${s.ordinal}. ${s.name}` }));
  const name = (id: string) => STATIONS.find((s) => s.id === id)?.name ?? id;

  return (
    <ChartFrame
      as="h2"
      title="Last 24 hours — thresholds crossed"
      footnote="Every location on one time axis. A band is the period a reading was over its warning or alert line."
      table={
        data
          ? {
              head: ['Location', 'Reading', 'Level', 'From', 'To', 'Duration'],
              rows: data.bands.map((b) => [
                name(b.locationId),
                b.label,
                b.severity === 'alert' ? 'Alert' : 'Warning',
                fmtTime(b.from),
                fmtTime(b.to),
                fmtDuration(b.to - b.from),
              ]),
            }
          : undefined
      }
    >
      {data ? (
        <BandTimeline rows={rows} bands={data.bands} from={data.from} to={data.to} />
      ) : (
        <div className="h-56 animate-pulse rounded bg-muted/60" />
      )}
    </ChartFrame>
  );
}
