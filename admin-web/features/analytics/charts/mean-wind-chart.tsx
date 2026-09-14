'use client';

import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { COMPASS_16, sectorIndex } from '@/components/charts/chart-utils';
import { StatTile } from '@/components/charts/stat-tile';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useMetMeanWind } from '../use-analytics';
import { useUnits } from '@/lib/units/use-units';

const compass = (deg: number | null) => (deg == null ? '—' : COMPASS_16[sectorIndex(deg)]);
const xFmt = (v: number | null) =>
  new Date(Number(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The WMO 10-minute mean wind — the standard reported quantity (WMO-No. 8).
 *
 * Sits beside the gust chart because the two are the pair a met station
 * publishes: the sustained wind, and the peak within it. Comparing our figures
 * against any reference station means comparing these, not the instantaneous
 * reading the live dial shows.
 *
 * NO INTERVAL PICKER, unlike the gust chart. The averaging period is part of the
 * definition — a "10-minute mean" over 4 hours is not a 10-minute mean, and
 * offering the choice would invite someone to produce a number that looks
 * official and is not.
 *
 * DIRECTION IS NOT PLOTTED as a second series. It is an angle on a 0–360 scale
 * that wraps, so a line crossing north falls the full height of the chart and
 * reads as a collapse. It is shown as a compass label on the peak tile instead.
 */
export function MeanWindChart({ deviceId }: { deviceId?: string }) {
  const units = useUnits();
  const { data, isLoading } = useMetMeanWind(deviceId);

  const points = data?.data ?? [];
  const strongest = points.length
    ? points.reduce((a, b) => ((b.speedMs ?? -1) > (a.speedMs ?? -1) ? b : a), points[0])
    : null;

  /**
   * A 10-minute block built from a handful of readings is not a 10-minute mean.
   * At 1 Hz a full block is ~600 samples; anything far below that is a gap in
   * the data, and saying so is better than quietly averaging it anyway.
   */
  const thin = points.filter((p) => p.samples < 60).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Mean wind — 10 minute (WMO)</h3>
        <p className="text-xs text-muted-foreground">
          Speed averaged arithmetically, direction averaged as vectors
        </p>
      </div>

      {isLoading ? (
        <LoadingState label="Loading mean wind…" />
      ) : points.length === 0 ? (
        <EmptyState title="No wind data in range" body="Widen the date range or pick a device with wind data." />
      ) : (
        <>
          {strongest && strongest.speedMs != null ? (
            <StatTile
              label="Strongest 10-minute mean"
              value={`${units.format(strongest.speedMs, 'm/s')} ${units.unitFor('m/s')}`}
              sub={`from ${compass(strongest.dirDeg)} · ${new Date(strongest.ts).toLocaleString()}`}
            />
          ) : null}

          <TimeSeriesChart
            data={points.map((d) => ({ timestampMs: d.ts, mean: units.value(d.speedMs, 'm/s') }))}
            xKey="timestampMs"
            unit={units.unitFor('m/s')}
            title="10-minute mean wind speed"
            xFormatter={xFmt}
            series={[{ key: 'mean', label: 'Mean wind', role: 'chart-2' }]}
            exportName="met-mean-wind"
          />

          {thin > 0 ? (
            <p className="text-xs text-muted-foreground">
              {thin} of {points.length} periods had fewer than 60 readings — the station was not reporting
              continuously, so those means cover less than the full ten minutes.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
