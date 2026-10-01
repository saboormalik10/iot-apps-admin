'use client';

import { useMemo } from 'react';
import type { LocationId, ParameterId, Reading } from '@/lib/api/types';
import { PARAMETER_LABELS, PARAMETER_UNITS, buildSeries } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart, type ThresholdMark } from '@/components/charts/series';
import { fmtDateTime, fmtDuration, fmtValue } from '@/lib/format';
import { STATIONS, STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';
import { SERIES } from '@/lib/viz/roles';

/**
 * §8.3 "trend analysis" on the queried set: the same rows the table pages
 * through, drawn — one chart per parameter (never two scales on one axis), one
 * line per location, and under each chart the figures an engineer writes in a
 * post-event report: lowest, mean, highest and when, and time spent over the
 * line.
 *
 * Inside a chart the line colour is the *location's*, taken from its fixed place
 * on the line rather than its place in the query, so Belmore is the same colour
 * whether it is queried alone or with three others.
 */
const LOCATION_COLOR: Record<LocationId, string> = Object.fromEntries(STATIONS.map((s, i) => [s.id, SERIES[i % SERIES.length]])) as Record<
  LocationId,
  string
>;

function thresholdsFor(p: ParameterId): ThresholdMark[] {
  switch (p) {
    case 'rainfall':
    case 'rain_1h':
      return [{ value: THRESHOLDS.rainfall.intensity.value, label: THRESHOLD_LABELS.rainIntensity, tone: 'critical' }];
    case 'water_level':
      return [
        { value: THRESHOLDS.flood.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
        { value: THRESHOLDS.flood.standingWaterMm, label: `standing water +${THRESHOLDS.flood.standingWaterMm} mm`, tone: 'setpoint' },
      ];
    case 'temperature':
      return [{ value: THRESHOLDS.temperature.heat1.value, label: THRESHOLD_LABELS.tempHeat1, tone: 'critical' }];
    case 'wind_gust':
      return [{ value: THRESHOLDS.wind.gustWarn.value, label: THRESHOLD_LABELS.windGust, tone: 'critical' }];
    default:
      return [];
  }
}

export function QueryTrends({
  locations,
  parameters,
  from,
  to,
}: {
  locations: LocationId[];
  parameters: ParameterId[];
  from: number;
  to: number;
}) {
  const charts = useMemo(
    () =>
      parameters
        .filter((p) => p !== 'float_switch' && p !== 'wind_dir')
        .map((parameter) => {
          const fitted = locations.filter((l) => STATIONS_BY_ID[l].sensors.some((s) => s.parameter === parameter));
          const series = fitted.map((l) => ({ locationId: l, points: buildSeries(parameter, l, from, to, 220) }));
          const line = thresholdsFor(parameter)[0]?.value;
          /* The figures come from a 5-minute grid, not the drawn line: an hourly
             sample would put "time over the line" in whole hours. */
          const fine = Math.min(4000, Math.ceil((to - from) / 300_000));
          const stats = fitted.map((l) => summarise(buildSeries(parameter, l, from, to, fine), line));
          return { parameter, series, stats, line };
        })
        .filter((c) => c.series.length),
    [locations, parameters, from, to],
  );

  if (!charts.length) return null;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {charts.map((c) => {
        const unit = PARAMETER_UNITS[c.parameter];
        return (
          <ChartFrame
            key={c.parameter}
            title={`${PARAMETER_LABELS[c.parameter]} — query period`}
            unit={unit}
            footnote={`${fmtDateTime(from)} → ${fmtDateTime(to)} · ${c.series.length} location${c.series.length === 1 ? '' : 's'}`}
            rows={c.series.map((s) => ({ label: `${STATIONS_BY_ID[s.locationId].name} (${unit})`, points: s.points }))}
          >
            <SeriesChart
              height={200}
              legend={c.series.length > 1}
              syncId="history-query"
              thresholds={thresholdsFor(c.parameter)}
              series={c.series.map((s) => ({
                key: s.locationId,
                label: STATIONS_BY_ID[s.locationId].name,
                points: s.points,
                parameter: c.parameter,
                color: c.series.length > 1 ? LOCATION_COLOR[s.locationId] : undefined,
              }))}
            />
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[460px] text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    {['Location', 'Lowest', 'Mean', 'Highest', ...(c.line !== undefined ? ['Over the line'] : [])].map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {c.series.map((s, i) => {
                    const st = c.stats[i];
                    return (
                      <tr key={s.locationId} className="border-t">
                        <td className="flex items-center gap-1.5 px-2 py-1 font-sans">
                          <span
                            className="h-2 w-3 rounded-sm"
                            style={{ background: c.series.length > 1 ? LOCATION_COLOR[s.locationId] : undefined }}
                            aria-hidden
                          />
                          {STATIONS_BY_ID[s.locationId].name}
                        </td>
                        <td className="px-2 py-1">{fmtValue(st.min)}</td>
                        <td className="px-2 py-1">{fmtValue(st.mean)}</td>
                        <td className="px-2 py-1">
                          {fmtValue(st.max)}
                          {st.maxAt ? <span className="text-muted-foreground"> · {fmtDateTime(st.maxAt)}</span> : null}
                        </td>
                        {c.line !== undefined ? (
                          <td className="px-2 py-1">{st.overMs ? fmtDuration(st.overMs) : '—'}</td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartFrame>
        );
      })}
    </div>
  );
}

function summarise(points: Reading[], line: number | undefined) {
  const vals = points.filter((p) => p.v !== null) as { t: number; v: number }[];
  if (!vals.length) return { min: null, mean: null, max: null, maxAt: undefined, overMs: 0 };
  let max = vals[0];
  let min = vals[0].v;
  let sum = 0;
  let overMs = 0;
  vals.forEach((p, i) => {
    sum += p.v;
    if (p.v > max.v) max = p;
    if (p.v < min) min = p.v;
    // The interval *after* a reading over the line counts — the water was over it from then on.
    if (line !== undefined && i > 0 && vals[i - 1].v >= line) overMs += p.t - vals[i - 1].t;
  });
  return { min, mean: Math.round((sum / vals.length) * 10) / 10, max: max.v, maxAt: max.t, overMs };
}
