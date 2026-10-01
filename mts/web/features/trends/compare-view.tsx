'use client';

import { useMemo } from 'react';
import type { ParameterId } from '@/lib/api/types';
import { buildSeries, statusFor } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SmallMultiples, type Panel } from '@/components/charts/small-multiples';
import { fmtDateTime, fmtValue } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { PARAM_COLOR } from '@/lib/viz/roles';

/**
 * One measurement at every location that has it — small multiples on one scale.
 * See components/charts/small-multiples.tsx for why the scale is shared.
 */
export const COMPARABLE: { id: ParameterId; label: string; unit: string; threshold: number; thresholdLabel: string }[] = [
  {
    id: 'water_level',
    label: 'Water level',
    unit: 'mm',
    threshold: THRESHOLDS.flood.railFootMm,
    thresholdLabel: `Rail foot ${THRESHOLDS.flood.railFootMm} mm (block the line)`,
  },
  {
    id: 'rainfall',
    label: 'Rainfall (1-hour total)',
    unit: 'mm/hr',
    threshold: THRESHOLDS.rainfall.intensity.value,
    thresholdLabel: `≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr`,
  },
  {
    id: 'wind_gust',
    label: 'Wind gust',
    unit: 'km/h',
    threshold: THRESHOLDS.wind.gustWarn.value,
    thresholdLabel: `≥ ${THRESHOLDS.wind.gustWarn.value} km/h`,
  },
  {
    id: 'temperature',
    label: 'Air temperature',
    unit: '°C',
    threshold: THRESHOLDS.temperature.heat1.value,
    thresholdLabel: `≥ ${THRESHOLDS.temperature.heat1.value} °C`,
  },
];

export function CompareView({ parameter, from, to, count }: { parameter: ParameterId; from: number; to: number; count: number }) {
  const spec = COMPARABLE.find((c) => c.id === parameter)!;
  const minute = Math.floor(to / 60_000);

  const panels: Panel[] = useMemo(() => {
    const out: Panel[] = [];
    for (const station of STATIONS) {
      for (const sensor of station.sensors.filter((s) => s.parameter === parameter)) {
        const points = buildSeries(parameter, station.id, from, to, count, sensor.sensorId);
        const last = points[points.length - 1]?.v ?? null;
        const st = statusFor(parameter, last);
        const where = sensor.sensorId.includes('-UP-') ? ' — up tunnel' : sensor.sensorId.includes('-DN-') ? ' — down tunnel' : '';
        out.push({
          id: sensor.sensorId,
          label: `${station.ordinal}. ${station.name}${where}`,
          href: `/stations/${station.id}`,
          points,
          unit: spec.unit,
          tone: st === 'alert' ? 'alert' : st === 'warning' ? 'warning' : 'normal',
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameter, from, count, minute]);

  const peak = Math.max(...panels.flatMap((p) => p.points.map((x) => x.v ?? 0)));
  const domainMax = Math.ceil(Math.max(spec.threshold * 1.15, peak * 1.05) / 10) * 10;

  return (
    <ChartFrame
      as="h2"
      title={`${spec.label} — every location`}
      unit={spec.unit}
      footnote={`${panels.length} monitoring points, one shared scale. Select a panel to open its station.`}
      table={{
        head: ['Location', 'Now', 'Peak in range', 'Peak at'],
        rows: panels.map((p) => {
          const peakPt = p.points.reduce((a, b) => ((b.v ?? -Infinity) > (a.v ?? -Infinity) ? b : a), p.points[0]);
          return [p.label, fmtValue(p.points[p.points.length - 1]?.v ?? null), fmtValue(peakPt?.v ?? null), peakPt ? fmtDateTime(peakPt.t) : '–'];
        }),
      }}
    >
      <SmallMultiples
        panels={panels}
        color={PARAM_COLOR[parameter]}
        threshold={spec.threshold}
        thresholdLabel={spec.thresholdLabel}
        domainMax={domainMax}
      />
    </ChartFrame>
  );
}
