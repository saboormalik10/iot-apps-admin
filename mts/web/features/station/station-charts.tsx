'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AlertEvent, StationLocation } from '@/lib/api/types';
import { buildSeries, listEvents } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart, type ThresholdMark } from '@/components/charts/series';
import { WindRoseCard } from '@/features/trends/wind-rose-card';
import { useDataRevision } from '@/lib/use-data';
import { fmtSigned, fmtValue } from '@/lib/format';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';
import { pointLabel } from './reading-card';

/**
 * Charts of everything this station measures.
 *
 * Previously a station page drew water level and nothing else, so Windsor Road —
 * which measures wind and temperature only — had no chart of its own at all.
 * Now each station charts what it is fitted with: the level trend with the
 * events that explain it marked on the time axis, and a synchronised day of
 * everything else (hover one chart, read the same moment on all of them).
 */

/** Short labels for the moments worth marking on a level chart. */
const MARK: Record<string, string> = {
  'evt-duty-start': 'Duty pump on',
  'evt-standby-start': 'Standby on',
  'evt-rail-foot': 'Rail foot',
  'evt-rail-foot-clear': 'Below rail foot',
  'evt-trending-down': 'Trending down',
  'evt-pumps-off': 'Pumps off',
  'evt-canterbury-ptz': 'Standing water',
  'evt-dulwich-watch': 'Rise watch',
};

export function levelThresholds(station: StationLocation): ThresholdMark[] {
  const F = THRESHOLDS.flood;
  return station.pumpStation
    ? [
        { value: F.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
        { value: F.highHighMm, label: THRESHOLD_LABELS.highHigh, tone: 'setpoint' },
        { value: F.pumpStartMm, label: THRESHOLD_LABELS.pumpStart, tone: 'setpoint' },
      ]
    : [
        { value: F.railFootMm, label: THRESHOLD_LABELS.railFoot, tone: 'critical' },
        { value: F.standingWaterMm, label: `standing water +${F.standingWaterMm} mm (PTZ check)`, tone: 'setpoint' },
      ];
}

export function StationCharts({ station, now }: { station: StationLocation; now: number }) {
  const revision = useDataRevision();
  const minute = Math.floor(now / 60_000);
  const has = (p: string) => station.sensors.some((s) => s.parameter === p);
  const levelSensors = station.sensors.filter((s) => s.parameter === 'water_level');

  const [events, setEvents] = useState<AlertEvent[]>([]);
  useEffect(() => {
    listEvents({ locationId: station.id, withinDays: 1, pageSize: 100 }).then((p) => setEvents(p.items));
  }, [station.id, minute, revision]);

  const level = useMemo(
    () => levelSensors.map((s) => ({ s, points: buildSeries('water_level', station.id, now - 3 * 3_600_000, now, 120, s.sensorId) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [station.id, minute],
  );
  const day = useMemo(() => {
    const from = now - 24 * 3_600_000;
    const pts = (p: Parameters<typeof buildSeries>[0], n = 97) => buildSeries(p, station.id, from, now, n);
    return {
      rain: has('rainfall') ? pts('rainfall', 49) : [],
      mean: has('wind_mean') ? pts('wind_mean') : [],
      gust: has('wind_gust') ? pts('wind_gust') : [],
      temp: has('temperature') ? pts('temperature') : [],
      rh: has('humidity') ? pts('humidity') : [],
      pres: has('pressure') ? pts('pressure') : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.id, Math.floor(minute / 10)]);

  const markers = events
    .filter((e) => MARK[e.id])
    .map((e) => ({ t: e.t, label: MARK[e.id], tone: e.severity === 'alert' ? ('alert' as const) : ('info' as const) }));
  const sync = `station-${station.id}`;
  const last = (arr: { v: number | null }[]) => arr[arr.length - 1]?.v ?? null;
  const twoPoints = level.length > 1;

  return (
    <div className="space-y-4">
      {level.length ? (
        <ChartFrame
          title="Water level — last 3 hours"
          unit="mm"
          footnote={
            twoPoints
              ? 'Both tunnel monitoring points on one axis — up tunnel solid, down tunnel dashed'
              : 'YGRD-65-D radar, millimetres above datum. Events are marked where they happened.'
          }
          nowLabel={level.map((l) => `${pointLabel(l.s.sensorId) ?? 'now'} ${fmtSigned(last(l.points))}`).join(' · ') + ' mm'}
          nowTone={level.some((l) => (last(l.points) ?? 0) >= THRESHOLDS.flood.standingWaterMm) ? 'alert' : 'normal'}
          rows={level.map((l) => ({ label: `${pointLabel(l.s.sensorId) ?? 'Water level'} (mm)`, points: l.points }))}
        >
          <SeriesChart
            height={260}
            series={level.map((l, i) => ({
              key: l.s.sensorId,
              label: pointLabel(l.s.sensorId) ?? 'Water level',
              points: l.points,
              parameter: 'water_level' as const,
              kind: twoPoints ? undefined : ('area' as const),
              dashed: i > 0,
            }))}
            thresholds={levelThresholds(station)}
            markers={markers}
            emptyText="No radar data in this period: the radar is not responding. Flood alerting continues from the float switch."
            bands={
              station.pumpStation
                ? (() => {
                    const on = events.find((e) => e.id === 'evt-duty-start')?.t;
                    const off = events.find((e) => e.id === 'evt-pumps-off')?.t;
                    return on ? [{ from: on, to: off ?? now, label: 'pumps running', tone: 'warning' as const }] : [];
                  })()
                : []
            }
          />
        </ChartFrame>
      ) : null}

      {day.rain.length || day.mean.length || day.temp.length ? (
        <>
          <h2 className="pt-1 text-sm font-semibold">Last 24 hours at this station</h2>
          {/* A station with one daily measurement gets it full width, not half a
              row with a hole beside it. */}
          <div className={`grid min-w-0 gap-4 ${[day.rain, day.mean, day.temp].filter((x) => x.length).length > 1 || day.mean.length ? 'md:grid-cols-2' : ''}`}>
            {day.rain.length ? (
              <ChartFrame
                title="Rainfall — rolling 1-hour total"
                unit="mm"
                footnote={`Bars over ${THRESHOLD_LABELS.rainIntensity} are in alert red`}
                nowLabel={`now ${fmtValue(last(day.rain), 1)} mm`}
                nowTone={(last(day.rain) ?? 0) >= THRESHOLDS.rainfall.intensity.value ? 'alert' : 'normal'}
                rows={[{ label: 'Rolling 1-hour total (mm)', points: day.rain }]}
              >
                <SeriesChart
                  height={200}
                  syncId={sync}
                  series={[{ key: 'rain', label: 'Rainfall', points: day.rain, parameter: 'rainfall', kind: 'bar', alertAbove: THRESHOLDS.rainfall.intensity.value }]}
                  thresholds={[{ value: THRESHOLDS.rainfall.intensity.value, label: THRESHOLD_LABELS.rainIntensity, tone: 'critical' }]}
                />
              </ChartFrame>
            ) : null}

            {day.mean.length ? (
              <ChartFrame
                title="Wind speed"
                unit="km/h"
                footnote="Solid: 2-minute mean · dashed: 3-second gust"
                nowLabel={`gust ${fmtValue(last(day.gust), 0)} km/h`}
                nowTone={(last(day.gust) ?? 0) >= THRESHOLDS.wind.gustWarn.value ? 'warning' : 'normal'}
                rows={[
                  { label: 'Mean (km/h)', points: day.mean },
                  { label: 'Gust (km/h)', points: day.gust },
                ]}
              >
                <SeriesChart
                  height={200}
                  syncId={sync}
                  series={[
                    { key: 'mean', label: 'Mean', points: day.mean, parameter: 'wind_mean' },
                    { key: 'gust', label: 'Gust', points: day.gust, parameter: 'wind_gust', dashed: true },
                  ]}
                  thresholds={[{ value: THRESHOLDS.wind.gustWarn.value, label: THRESHOLD_LABELS.windGust, tone: 'critical' }]}
                />
              </ChartFrame>
            ) : null}

            {day.mean.length ? <WindRoseCard locationId={station.id} days={1} minuteKey={minute} /> : null}

            {day.temp.length ? (
              <ChartFrame
                title="Air temperature"
                unit="°C"
                nowLabel={`now ${fmtValue(last(day.temp), 1)} °C`}
                rows={[{ label: 'Temperature (°C)', points: day.temp }]}
              >
                <SeriesChart
                  height={200}
                  syncId={sync}
                  series={[{ key: 'temp', label: 'Temperature', points: day.temp, parameter: 'temperature', kind: 'area' }]}
                  thresholds={[{ value: THRESHOLDS.temperature.heat1.value, label: THRESHOLD_LABELS.tempHeat1, tone: 'critical' }]}
                />
              </ChartFrame>
            ) : null}

            {day.rh.length ? (
              <ChartFrame title="Relative humidity" unit="%RH" nowLabel={`now ${fmtValue(last(day.rh), 0)} %`} rows={[{ label: 'Humidity (%RH)', points: day.rh }]}>
                <SeriesChart
                  height={200}
                  syncId={sync}
                  domain={[0, 100]}
                  series={[{ key: 'rh', label: 'Humidity', points: day.rh, parameter: 'humidity', kind: 'area' }]}
                />
              </ChartFrame>
            ) : null}

            {day.pres.length ? (
              <ChartFrame
                title="Barometric pressure"
                unit="hPa"
                footnote="GMX300. A steady fall ahead of a front is the earliest sign of the weather arriving."
                nowLabel={`now ${fmtValue(last(day.pres), 1)} hPa`}
                rows={[{ label: 'Pressure (hPa)', points: day.pres }]}
              >
                <SeriesChart
                  height={200}
                  syncId={sync}
                  /* No domain: the chart gives a measure that lives near 1,000 hPa round ends of its own. */
                  series={[{ key: 'pres', label: 'Pressure', points: day.pres, parameter: 'pressure' }]}
                />
              </ChartFrame>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
