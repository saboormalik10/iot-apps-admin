'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { LocationId, ParameterId } from '@/lib/api/types';
import { buildSeries, statusFor } from '@/lib/api/endpoints';
import { ChartFrame } from '@/components/charts/chart-frame';
import { SeriesChart } from '@/components/charts/series';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/screen-states';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtInt, fmtValue } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';
import { COMPARABLE, CompareView } from './compare-view';
import { WindRoseCard } from './wind-rose-card';
import { levelThresholds } from '@/features/station/station-charts';

/**
 * Trends — the chart language for the whole product.
 *
 * Each chart draws its own rule as a dashed line labelled with the value, so the
 * reader never has to remember what 25 mm/hr means or go and look it up. Rainfall
 * bars that break their threshold turn red in place, which is the fastest way to
 * answer "when did it go over?" without reading an axis.
 *
 * At tablet width the 2×2 becomes a single column rather than shrinking: four
 * charts squeezed side by side are four charts nobody can read.
 */

const RANGES = [
  { id: '24h', label: 'Last 24 hours', ms: 24 * 3_600_000 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 3_600_000 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 3_600_000 },
] as const;

const INTERVALS = [
  { id: '10min', label: '10 minutes', ms: 10 * 60_000 },
  { id: '1h', label: '1 hour', ms: 3_600_000 },
  { id: '1d', label: '1 day', ms: 24 * 3_600_000 },
] as const;

/** Every series on screen, in one file, with the disclaimer carried into it. */
function exportAll(stationName: string, series: Record<string, { t: number; v: number | null }[]>) {
  const keys = Object.keys(series).filter((k) => series[k].length);
  if (!keys.length) return;
  const times = series[keys[0]].map((p) => p.t);
  const csv = [
    `# SYNTHETIC DEMO DATA — ${stationName} — Sydney Metro M1 design prototype — not measurements`,
    ['Time', ...keys].join(','),
    ...times.map((t, i) => [new Date(t).toISOString(), ...keys.map((k) => series[k][i]?.v ?? '')].join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${stationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-trends-demo.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TrendsPage() {
  const now = useDemoClock();
  const [stationId, setStationId] = useState<LocationId>('belmore');
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('24h');
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]['id']>('1h');
  /* One station in depth, or one measurement across every location. A view in
     the filter row rather than a second page, so the range and interval above
     scope both. */
  const [view, setView] = useState<'station' | 'compare'>('station');
  const [compareParam, setCompareParam] = useState<ParameterId>('water_level');

  const station = STATIONS.find((s) => s.id === stationId)!;
  const range = RANGES.find((r) => r.id === rangeId)!;
  const from = now - range.ms;

  const has = (p: string) => station.sensors.some((s) => s.parameter === p);

  /* The sample count comes from the interval, so choosing "10 minutes" actually
     changes the sampling. It used to draw 160 points whatever was selected, which
     made the control decorative — the table underneath still showed nine-minute
     steps for a one-hour interval. Capped, because 30 days at 10 minutes is 4,320
     points and no screen is that wide. */
  const step = INTERVALS.find((i) => i.id === interval)!.ms;
  const count = Math.max(2, Math.min(600, Math.round(range.ms / step) + 1));

  const series = useMemo(() => {
    const points = (p: Parameters<typeof buildSeries>[0]) => buildSeries(p, stationId, from, now, count);
    return {
      windMean: points('wind_mean'),
      windGust: points('wind_gust'),
      rainfall: points('rainfall'),
      temperature: points('temperature'),
      humidity: points('humidity'),
      /* Per sensor: Lady Game Drive's two tunnels are two lines, not one. */
      levels: station.sensors
        .filter((x) => x.parameter === 'water_level')
        .map((x) => ({
          id: x.sensorId,
          label: x.sensorId.includes('-UP-') ? 'Up tunnel' : x.sensorId.includes('-DN-') ? 'Down tunnel' : 'Water level',
          points: buildSeries('water_level', stationId, from, now, count, x.sensorId),
        })),
      pressure: points('pressure'),
      rain1h: points('rain_1h'),
      rain3h: points('rain_3h'),
    };
    // The demo clock ticks every second; the charts should not redraw that often.
  }, [stationId, from, count, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the hooks: an early return above useMemo would change the hook order.
  if (!now) return <LoadingState label="Loading trends…" />;

  const last = (arr: { v: number | null }[]) => arr[arr.length - 1]?.v ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trends</h1>
          <p className="text-sm text-muted-foreground">
            Time series with each parameter&apos;s alert threshold drawn against it.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            /* Only what this station measures — a column of numbers for a sensor
               that is not fitted would be invented data in a file that leaves the
               screen. Named with units, tunnels split. */
            const cols: Record<string, { t: number; v: number | null }[]> = {};
            const add = (p: string, name: string, pts: { t: number; v: number | null }[]) => {
              if (has(p)) cols[name] = pts;
            };
            add('wind_mean', 'Wind mean (km/h)', series.windMean);
            add('wind_gust', 'Wind gust (km/h)', series.windGust);
            add('rainfall', 'Rainfall intensity (mm/hr)', series.rainfall);
            add('rainfall', 'Rain 1 h (mm)', series.rain1h);
            add('rainfall', 'Rain 3 h (mm)', series.rain3h);
            add('temperature', 'Temperature (°C)', series.temperature);
            add('humidity', 'Humidity (%RH)', series.humidity);
            add('pressure', 'Pressure (hPa)', series.pressure);
            series.levels.forEach((l) => (cols[`${l.label === 'Water level' ? 'Water level' : `Water level — ${l.label.toLowerCase()}`} (mm)`] = l.points));
            exportAll(station.name, cols);
          }}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="View">
          {(
            [
              ['station', 'One station'],
              ['compare', 'Compare locations'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={cn(
                'h-9 px-3 text-sm transition-colors',
                view === id ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'station' ? (
          <Field label="Station">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value as LocationId)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Measurement">
            <select
              value={compareParam}
              onChange={(e) => setCompareParam(e.target.value as ParameterId)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {COMPARABLE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Range">
          <select
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value as typeof rangeId)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Interval">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as typeof interval)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {INTERVALS.map((i) => (
              /* An interval that would give fewer than three points over the
                 chosen range is not a chart, so it is offered but not selectable. */
              <option key={i.id} value={i.id} disabled={range.ms / i.ms < 3}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="tabular ml-auto self-end pb-1.5 text-xs text-muted-foreground">
          {count} samples · one every {INTERVALS.find((i) => i.id === interval)!.label}
        </p>
      </div>

      {view === 'compare' ? (
        <CompareView parameter={compareParam} from={from} to={now} count={Math.min(count, 200)} />
      ) : (
      /* Figure 9: one column on a phone, two on a tablet, three on a wide desk. */
      <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {has('wind_mean') ? (
          <ChartFrame
            as="h2"
            title="Wind speed"
            unit="km/h"
            footnote="Solid: 2-minute mean · dashed: 3-second gust"
            nowLabel={`now ${fmtInt(last(series.windMean))} km/h`}
            nowTone={(last(series.windGust) ?? 0) >= THRESHOLDS.wind.gustWarn.value ? 'warning' : 'normal'}
            rows={[
              { label: 'Mean (km/h)', points: series.windMean },
              { label: 'Gust (km/h)', points: series.windGust },
            ]}
          >
            <SeriesChart
              syncId="trends"
              series={[
                { key: 'mean', label: 'Mean', points: series.windMean, parameter: 'wind_mean', kind: 'area' },
                { key: 'gust', label: 'Gust', points: series.windGust, parameter: 'wind_gust', dashed: true },
              ]}
              thresholds={[{ value: THRESHOLDS.wind.gustWarn.value, label: THRESHOLD_LABELS.windGust, tone: 'critical' }]}
            />
          </ChartFrame>
        ) : null}

        {has('wind_mean') ? (
          <WindRoseCard locationId={stationId} days={Math.max(1, Math.round(range.ms / 86_400_000))} minuteKey={Math.floor(now / 60_000)} />
        ) : null}

        {has('rainfall') ? (
          <ChartFrame
            as="h2"
            title="Rainfall intensity"
            unit="mm/hr"
            footnote={`Bars over ${THRESHOLD_LABELS.rainIntensity} are shown in alert red`}
            nowLabel={`now ${fmtValue(last(series.rainfall), 1)} mm/hr`}
            nowTone={(last(series.rainfall) ?? 0) >= THRESHOLDS.rainfall.intensity.value ? 'alert' : 'normal'}
            rows={[{ label: 'Rainfall (mm/hr)', points: series.rainfall }]}
          >
            <SeriesChart
              syncId="trends"
              series={[
                {
                  key: 'rain',
                  label: 'Rainfall',
                  points: series.rainfall,
                  parameter: 'rainfall',
                  kind: 'bar',
                  alertAbove: THRESHOLDS.rainfall.intensity.value,
                },
              ]}
              thresholds={[
                { value: THRESHOLDS.rainfall.intensity.value, label: THRESHOLD_LABELS.rainIntensity, tone: 'critical' },
              ]}
            />
          </ChartFrame>
        ) : null}

        {/* §7.2's "running total": the 1-hour and 3-hour tallies the rules are
            judged on, each with its own line. Same unit, so one axis; same
            parameter, so one hue — the 3-hour total is the dashed one. */}
        {has('rainfall') ? (
          <ChartFrame
            as="h2"
            title="Rolling rainfall totals"
            unit="mm"
            footnote="What the rule engine compares against its thresholds"
            nowLabel={`1 h ${fmtValue(last(series.rain1h), 1)} · 3 h ${fmtValue(last(series.rain3h), 1)} mm`}
            nowTone={
              (last(series.rain1h) ?? 0) >= THRESHOLDS.rainfall.intensity.value ||
              (last(series.rain3h) ?? 0) >= THRESHOLDS.rainfall.short.value
                ? 'alert'
                : 'normal'
            }
            rows={[
              { label: '1-hour total (mm)', points: series.rain1h },
              { label: '3-hour total (mm)', points: series.rain3h },
            ]}
          >
            <SeriesChart
              syncId="trends"
              series={[
                { key: 'r1', label: '1-hour total', points: series.rain1h, parameter: 'rain_1h' },
                { key: 'r3', label: '3-hour total', points: series.rain3h, parameter: 'rain_3h', dashed: true },
              ]}
              thresholds={[
                { value: THRESHOLDS.rainfall.short.value, label: THRESHOLD_LABELS.rainShort, tone: 'critical' },
                { value: THRESHOLDS.rainfall.intensity.value, label: `≥ ${THRESHOLDS.rainfall.intensity.value} mm / 1 h`, tone: 'setpoint' },
              ]}
            />
          </ChartFrame>
        ) : null}

        {has('temperature') ? (
          <ChartFrame
            as="h2"
            title="Air temperature"
            unit="°C"
            nowLabel={`now ${fmtValue(last(series.temperature), 1)} °C`}
            nowTone={(last(series.temperature) ?? 0) >= THRESHOLDS.temperature.heat1.value ? 'warning' : 'normal'}
            rows={[{ label: 'Temperature (°C)', points: series.temperature }]}
          >
            <SeriesChart
              syncId="trends"
              series={[{ key: 'temp', label: 'Temperature', points: series.temperature, parameter: 'temperature', kind: 'area' }]}
              thresholds={[
                { value: THRESHOLDS.temperature.heat1.value, label: THRESHOLD_LABELS.tempHeat1, tone: 'critical' },
              ]}
            />
          </ChartFrame>
        ) : null}

        {has('humidity') ? (
          <ChartFrame
            as="h2"
            title="Relative humidity"
            unit="%RH"
            nowLabel={`now ${fmtInt(last(series.humidity))}%`}
            rows={[{ label: 'Humidity (%RH)', points: series.humidity }]}
          >
            <SeriesChart
              syncId="trends"
              series={[{ key: 'rh', label: 'Humidity', points: series.humidity, parameter: 'humidity', kind: 'area' }]}
              domain={[0, 100]}
            />
          </ChartFrame>
        ) : null}

        {/* Rev B adds level to the trends list; the client's Figure 7 predates it.
            Set points are the location's own: pump-start and high-high exist only
            where there are pumps; elsewhere standing water and the rail foot. */}
        {series.levels.length ? (
          <ChartFrame
            as="h2"
            title="Water level"
            unit="mm"
            footnote="Millimetres above datum"
            nowLabel={`now ${series.levels.map((l) => `${fmtInt(last(l.points))}`).join(' / ')} mm`}
            nowTone={series.levels.some((l) => statusFor('water_level', last(l.points)) === 'alert') ? 'alert' : series.levels.some((l) => statusFor('water_level', last(l.points)) === 'warning') ? 'warning' : 'normal'}
            rows={series.levels.map((l) => ({ label: `${l.label} (mm)`, points: l.points }))}
          >
            <SeriesChart
              syncId="trends"
              legend={series.levels.length > 1}
              series={series.levels.map((l, i) => ({
                key: l.id,
                label: l.label,
                points: l.points,
                parameter: 'water_level' as const,
                kind: series.levels.length > 1 ? ('line' as const) : ('area' as const),
                dashed: i > 0,
              }))}
              thresholds={levelThresholds(station)}
            />
          </ChartFrame>
        ) : null}

        {/* The GMX300 reads pressure too (§5.3): a front shows in the fall before the rain arrives. */}
        {has('pressure') ? (
          <ChartFrame
            as="h2"
            title="Barometric pressure"
            unit="hPa"
            footnote={pressureTendency(series.pressure)}
            nowLabel={`now ${fmtValue(last(series.pressure), 1)} hPa`}
            rows={[{ label: 'Pressure (hPa)', points: series.pressure }]}
          >
            <SeriesChart
              syncId="trends"
              series={[{ key: 'p', label: 'Pressure', points: series.pressure, parameter: 'pressure' }]}
            />
          </ChartFrame>
        ) : null}
      </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** "Falling 3.2 hPa in the last 3 hours" — the tendency a forecaster reads first. */
function pressureTendency(points: { t: number; v: number | null }[]): string {
  const end = points[points.length - 1];
  const start = [...points].reverse().find((p) => end && p.v !== null && end.t - p.t >= 3 * 3_600_000);
  if (!end || end.v === null || !start || start.v === null) return 'Station pressure, GMX300';
  const d = Math.round((end.v - start.v) * 10) / 10;
  return `${d < 0 ? 'Falling' : d > 0 ? 'Rising' : 'Steady'} ${Math.abs(d)} hPa in the last 3 hours · GMX300`;
}
