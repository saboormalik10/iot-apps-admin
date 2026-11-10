'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUp, Info } from 'lucide-react';
import type {
  AlertEvent,
  LiveReading,
  Logger,
  StationLive,
  VigilanceStatus,
} from '@/lib/api/types';
import {
  PARAMETER_LABELS,
  buildSeries,
  compass,
  getVigilance,
  listEvents,
  rainTotalsNow,
} from '@/lib/api/endpoints';
import { SeriesChart } from '@/components/charts/series';
import { Meter } from '@/components/charts/meter';
import { StatusPill, readingTone } from '@/components/status/status-pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDataRevision } from '@/lib/use-data';
import { fmtDateTime, fmtInt, fmtSigned, fmtValue } from '@/lib/format';
import { THRESHOLDS, THRESHOLD_LABELS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';
import { levelThresholds } from './station-charts';
import { pointLabel } from './reading-card';

/**
 * The station page, grouped (client, 10 Nov 2026: "Please put some thought on this
 * screen. The presentation does not seem very well thought").
 *
 * Read top to bottom it answers: is this station OK → if not, what is wrong → how
 * are flood, rain, wind and weather → is the station itself healthy. Each panel
 * holds one theme: its status, one or two big numbers, the line they are judged
 * against, and one chart with that line drawn. Only what the proposal asks for is
 * shown; instrument models and tip counts sit behind the ⓘ.
 */

type Tone = 'normal' | 'warning' | 'alert';
const SILENT_MS = 15 * 60_000;

const worst = (rs: (LiveReading | undefined)[]): Tone =>
  rs.some((r) => r?.status === 'alert')
    ? 'alert'
    : rs.some((r) => r?.status === 'warning')
      ? 'warning'
      : 'normal';

const EDGE: Record<Tone, string> = {
  alert: 'border-l-4 border-l-sev-alert',
  warning: 'border-l-4 border-l-sev-warning',
  normal: '',
};

export function silentLogger(l: Logger, now: number): boolean {
  return now - l.lastSeen > SILENT_MS;
}

// ── the frame every panel shares ────────────────────────────────────────────

function Panel({
  id,
  title,
  tone,
  children,
  className,
}: {
  id: string;
  title: string;
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn('min-w-0 scroll-mt-20 rounded-lg border bg-card p-4', EDGE[tone], className)}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <StatusPill tone={readingTone(tone)} size="sm" />
      </header>
      {children}
    </section>
  );
}

/** A big figure: name, value, unit, and (optionally) the detail a technician wants behind ⓘ. */
function Figure({
  label,
  value,
  unit,
  tone = 'normal',
  sub,
  detail,
  size = 'lg',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  sub?: ReactNode;
  detail?: string;
  size?: 'lg' | 'md';
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {detail ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`About ${label}`}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
          </Tooltip>
        ) : null}
      </p>
      <p
        className={cn(
          'tabular font-semibold leading-tight',
          size === 'lg' ? 'text-3xl' : 'text-xl',
          tone === 'alert' && 'text-sev-alert-strong',
          tone === 'warning' && 'text-sev-warning-strong',
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        ) : null}
        {tone === 'alert' ? <span className="ml-1 text-base">▲</span> : null}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ChartCaption({ children }: { children: ReactNode }) {
  return <p className="mb-1 mt-4 text-xs font-medium text-muted-foreground">{children}</p>;
}

const tone = (r?: LiveReading): Tone =>
  r?.status === 'alert' ? 'alert' : r?.status === 'warning' ? 'warning' : 'normal';
const modelOf = (station: StationLive, r?: LiveReading) =>
  r
    ? station.location.sensors.find((s) => s.sensorId === r.sensorId && s.parameter === r.parameter)
        ?.model
    : undefined;

// ── 1. what is wrong, and is the station healthy ────────────────────────────

const PANEL_OF: Record<string, string> = {
  water_level: 'flood',
  float_switch: 'flood',
  rainfall: 'rain',
  wind_mean: 'wind',
  wind_gust: 'wind',
  temperature: 'weather',
  humidity: 'weather',
  pressure: 'weather',
};

export function StatusSummary({ station, now }: { station: StationLive; now: number }) {
  const flagged = station.readings.filter((r) => r.status === 'alert' || r.status === 'warning');
  const quiet = station.location.loggers.filter((l) => silentLogger(l, now));
  return (
    <section className="rounded-lg border bg-card">
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5 text-sm',
          flagged.some((r) => r.status === 'alert')
            ? 'bg-sev-alert-tint'
            : flagged.length
              ? 'bg-sev-warning-tint'
              : 'bg-sev-normal-tint',
        )}
      >
        {flagged.length ? (
          flagged.map((r) => (
            <a
              key={r.sensorId + r.parameter}
              href={`#${PANEL_OF[r.parameter] ?? 'flood'}`}
              className={cn(
                'font-medium hover:underline',
                r.status === 'alert' ? 'text-sev-alert-strong' : 'text-sev-warning-strong',
              )}
            >
              {r.status === 'alert' ? '▲ ' : '● '}
              {PARAMETER_LABELS[r.parameter]}
              {pointLabel(r.sensorId) ? ` (${pointLabel(r.sensorId)?.toLowerCase()})` : ''}{' '}
              {valueText(r)} —{' '}
              {r.status === 'alert' ? 'over its alert threshold' : 'approaching its threshold'}
            </a>
          ))
        ) : (
          <p className="font-medium text-sev-normal-strong">
            ✓ All readings within their thresholds
          </p>
        )}
        {quiet.length ? (
          <p className="font-medium text-sev-warning-strong">
            ● No data from {quiet.map((l) => l.id).join(', ')} for over 15 minutes
          </p>
        ) : null}
      </div>
      {/* Station health: the station itself, not a reading — a strip, not a card. */}
      <dl className="flex flex-col gap-y-1.5 px-4 py-2 text-xs">
        {station.location.loggers.map((l) => {
          const silent = silentLogger(l, now);
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-x-5 gap-y-0.5">
              <span className="font-semibold text-foreground">
                {station.location.loggers.length > 1
                  ? (pointLabel(`-${l.id.includes('UP') ? 'UP' : 'DN'}-`) ?? l.label)
                  : 'Station health'}
              </span>
              <span>
                <span className="text-muted-foreground">Battery </span>
                <span className="tabular font-medium">{l.batteryPct}%</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {l.charging ? 'solar charging' : 'on battery'}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Signal </span>
                <span className="tabular font-medium">
                  {l.signal.network} {l.signal.rssiDbm} dBm
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  ({l.signal.rssiDbm >= -85 ? 'good' : l.signal.rssiDbm >= -100 ? 'fair' : 'poor'})
                </span>
              </span>
              <span className={cn(silent && 'font-medium text-sev-warning-strong')}>
                {silent ? (
                  `No data since ${fmtDateTime(l.lastSeen)} — logger or network`
                ) : (
                  <>
                    <span className="text-muted-foreground">Last connected </span>
                    <span className="tabular font-medium">{fmtDateTime(l.lastSeen)}</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function valueText(r: LiveReading): string {
  if (r.value === null) return '–';
  if (r.parameter === 'float_switch') return r.value === 1 ? 'WET' : 'DRY';
  if (r.parameter === 'water_level') return `${fmtSigned(r.value)} mm`;
  return `${fmtValue(r.value, r.parameter === 'wind_mean' || r.parameter === 'wind_gust' ? 0 : 1)} ${r.unit}`;
}

// ── 2. flood ────────────────────────────────────────────────────────────────

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

export function FloodPanel({ station, now }: { station: StationLive; now: number }) {
  const revision = useDataRevision();
  const minute = Math.floor(now / 60_000);
  const levels = station.readings.filter((r) => r.parameter === 'water_level');
  const floats = station.readings.filter((r) => r.parameter === 'float_switch');
  const [events, setEvents] = useState<AlertEvent[]>([]);
  useEffect(() => {
    listEvents({ locationId: station.location.id, withinDays: 1, pageSize: 100 }).then((p) =>
      setEvents(p.items),
    );
  }, [station.location.id, minute, revision]);
  const series = useMemo(
    () =>
      levels.map((r) => ({
        id: r.sensorId,
        points: buildSeries(
          'water_level',
          station.location.id,
          now - 3 * 3_600_000,
          now,
          120,
          r.sensorId,
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [station.location.id, minute],
  );
  if (!levels.length && !floats.length) return null;

  const lines = levelThresholds(station.location).sort((a, b) => a.value - b.value);
  const points = levels.length ? levels : floats;
  const markers = events
    .filter((e) => MARK[e.id])
    .map((e) => ({
      t: e.t,
      label: MARK[e.id],
      tone: e.severity === 'alert' ? ('alert' as const) : ('info' as const),
    }));
  const on = events.find((e) => e.id === 'evt-duty-start')?.t;
  const off = events.find((e) => e.id === 'evt-pumps-off')?.t;

  return (
    <Panel id="flood" title="Flood" tone={worst([...levels, ...floats])}>
      <div className={cn('grid gap-4', points.length > 1 && 'sm:grid-cols-2')}>
        {points.map((lv) => {
          const where = pointLabel(lv.sensorId);
          const float = floats.find((f) => pointLabel(f.sensorId) === where);
          const next = lv.value === null ? undefined : lines.find((l) => l.value > (lv.value ?? 0));
          return (
            <div key={lv.sensorId} className="flex flex-wrap items-start gap-x-8 gap-y-3">
              {lv.parameter === 'water_level' ? (
                <Figure
                  label={where ? `Water level — ${where.toLowerCase()}` : 'Water level'}
                  value={lv.value === null ? '–' : fmtSigned(lv.value)}
                  unit="mm"
                  tone={tone(lv)}
                  detail={`${modelOf(station, lv)} radar, millimetres above datum.`}
                  sub={
                    lv.value === null
                      ? 'No radar data — flood alerting continues from the float switch'
                      : next
                        ? `${fmtInt(next.value - lv.value)} mm below ${next.label}`
                        : `Above ${lines[lines.length - 1].label}`
                  }
                />
              ) : null}
              {float ? (
                <Figure
                  label={where ? `Float switch — ${where.toLowerCase()}` : 'Float switch'}
                  value={float.value === 1 ? 'WET' : 'DRY'}
                  tone={tone(float)}
                  size="md"
                  detail={`${modelOf(station, float)}. ${float.note ?? ''}`}
                  sub={
                    float.note?.includes('DISAGREE') ? (
                      <span className="font-semibold text-sev-alert-strong">
                        Disagrees with the radar
                      </span>
                    ) : float.note?.includes('agree') ? (
                      'Agrees with the radar'
                    ) : undefined
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {series.length ? (
        <>
          <ChartCaption>Water level — last 3 hours (mm)</ChartCaption>
          <SeriesChart
            height={220}
            series={series.map((s, i) => ({
              key: s.id,
              label: pointLabel(s.id) ?? 'Water level',
              points: s.points,
              parameter: 'water_level' as const,
              kind: series.length > 1 ? undefined : ('area' as const),
              dashed: i > 0,
            }))}
            thresholds={levelThresholds(station.location)}
            markers={markers}
            bands={
              station.location.pumpStation && on
                ? [{ from: on, to: off ?? now, label: 'pumps running', tone: 'warning' as const }]
                : []
            }
            emptyText="No radar data in this period: flood alerting continues from the float switch."
          />
        </>
      ) : null}
    </Panel>
  );
}

// ── 3. rain ─────────────────────────────────────────────────────────────────

export function RainPanel({ station, now }: { station: StationLive; now: number }) {
  const r = station.readings.find((x) => x.parameter === 'rainfall');
  const minute = Math.floor(now / 60_000);
  const revision = useDataRevision();
  const [vig, setVig] = useState<VigilanceStatus | null>(null);
  useEffect(() => {
    if (!r) return;
    getVigilance().then((all) =>
      setVig(all.find((v) => v.locationId === station.location.id) ?? null),
    );
  }, [station.location.id, minute, revision, r]);
  const day = useMemo(
    () => (r ? buildSeries('rainfall', station.location.id, now - 24 * 3_600_000, now, 49) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [station.location.id, Math.floor(minute / 10), Boolean(r)],
  );
  if (!r) return null;
  const totals = rainTotalsNow(station.location.id);
  // A rule over its line is an alert; one in its vigilance countdown still needs watching.
  const rules = vig?.rules ?? [];
  const rainTone: Tone =
    tone(r) === 'alert' || rules.some((x) => x.state === 'breached')
      ? 'alert'
      : tone(r) === 'warning' || rules.some((x) => x.state === 'vigilance')
        ? 'warning'
        : 'normal';
  const mm = (v: number | null) => (v === null ? '–' : fmtValue(v, 1));

  return (
    <Panel id="rain" title="Rain" tone={rainTone}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <Figure
          label="Rainfall, last hour"
          value={mm(r.value)}
          unit="mm/hr"
          tone={tone(r)}
          detail={`${modelOf(station, r)} tipping bucket. ${r.note ?? ''}`}
          sub={`Alert at ≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr`}
        />
        <dl className="flex gap-5 text-xs">
          {[
            ['10 min', totals.m10],
            ['6 h', totals.h6],
            ['24 h', totals.h24],
          ].map(([label, v]) => (
            <div key={label as string}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular text-base font-semibold">
                {mm(v as number | null)}{' '}
                <span className="text-xs font-normal text-muted-foreground">mm</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {vig ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {vig.rules.map((rule) => (
            <Meter
              key={rule.id}
              label={`Rain in ${rule.windowLabel}`}
              sublabel={rule.state === 'vigilance' ? 'vigilance running' : undefined}
              value={rule.tallyMm}
              limit={rule.thresholdMm}
              unit="mm"
              compact
            />
          ))}
        </div>
      ) : null}
      <ChartCaption>Rainfall — last 24 hours, rolling 1-hour total (mm)</ChartCaption>
      <SeriesChart
        height={160}
        series={[
          {
            key: 'rain',
            label: 'Rainfall',
            points: day,
            parameter: 'rainfall',
            kind: 'bar',
            alertAbove: THRESHOLDS.rainfall.intensity.value,
          },
        ]}
        thresholds={[
          {
            value: THRESHOLDS.rainfall.intensity.value,
            label: THRESHOLD_LABELS.rainIntensity,
            tone: 'critical',
          },
        ]}
      />
    </Panel>
  );
}

// ── 4. wind ─────────────────────────────────────────────────────────────────

export function WindPanel({ station, now }: { station: StationLive; now: number }) {
  const mean = station.readings.find((x) => x.parameter === 'wind_mean');
  const gust = station.readings.find((x) => x.parameter === 'wind_gust');
  const dir = station.readings.find((x) => x.parameter === 'wind_dir');
  const minute = Math.floor(now / 60_000);
  const day = useMemo(() => {
    if (!mean) return { mean: [], gust: [] };
    const from = now - 24 * 3_600_000;
    return {
      mean: buildSeries('wind_mean', station.location.id, from, now, 97),
      gust: buildSeries('wind_gust', station.location.id, from, now, 97),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.location.id, Math.floor(minute / 10), Boolean(mean)]);
  if (!mean && !gust) return null;
  const W = THRESHOLDS.wind;

  return (
    <Panel id="wind" title="Wind" tone={worst([mean, gust])}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        {mean ? (
          <Figure
            label="Speed (2-min mean)"
            value={fmtValue(mean.value, 0)}
            unit="km/h"
            tone={tone(mean)}
            detail={`${modelOf(station, mean)}, 10 m.`}
          />
        ) : null}
        {gust ? (
          <Figure
            label="Gust (3-second)"
            value={fmtValue(gust.value, 0)}
            unit="km/h"
            tone={tone(gust)}
            sub={`TSR at ≥ ${W.gustWarn.value} / ${W.gustAlert.value} · block line ≥ ${W.extreme.value}`}
          />
        ) : null}
        {dir && dir.value !== null ? (
          <div className="flex items-center gap-3">
            {/* The arrow points where the wind is GOING; the words say where it is FROM. */}
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border"
              aria-hidden
            >
              <ArrowUp
                className="h-6 w-6 text-[hsl(var(--chart-7))]"
                style={{ transform: `rotate(${(dir.value + 180) % 360}deg)` }}
              />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Direction</p>
              <p className="tabular text-xl font-semibold">
                {compass(dir.value)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  {fmtInt(dir.value)}°
                </span>
              </p>
              <p className="text-xs text-muted-foreground">where it blows from</p>
            </div>
          </div>
        ) : null}
      </div>
      <ChartCaption>Wind — last 24 hours (km/h) · solid: mean · dashed: gust</ChartCaption>
      <SeriesChart
        height={180}
        series={[
          { key: 'mean', label: 'Mean', points: day.mean, parameter: 'wind_mean' },
          { key: 'gust', label: 'Gust', points: day.gust, parameter: 'wind_gust', dashed: true },
        ]}
        thresholds={[
          { value: W.gustWarn.value, label: THRESHOLD_LABELS.windGust, tone: 'critical' },
        ]}
      />
    </Panel>
  );
}

// ── 5. weather ──────────────────────────────────────────────────────────────

export function WeatherPanel({ station, now }: { station: StationLive; now: number }) {
  const temp = station.readings.find((x) => x.parameter === 'temperature');
  const rh = station.readings.find((x) => x.parameter === 'humidity');
  const pres = station.readings.find((x) => x.parameter === 'pressure');
  const minute = Math.floor(now / 60_000);
  const day = useMemo(
    () =>
      temp ? buildSeries('temperature', station.location.id, now - 24 * 3_600_000, now, 97) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [station.location.id, Math.floor(minute / 10), Boolean(temp)],
  );
  if (!temp && !rh && !pres) return null;
  const T = THRESHOLDS.temperature;

  return (
    <Panel id="weather" title="Weather" tone={worst([temp, rh, pres])}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        {temp ? (
          <Figure
            label="Air temperature"
            value={fmtValue(temp.value, 1)}
            unit="°C"
            tone={tone(temp)}
            detail={`${modelOf(station, temp)}, 1.5–2 m above rail.`}
            sub={`Heat alerts at ≥ ${T.heat1.value} / ${T.heat2.value} °C`}
          />
        ) : null}
        {rh ? <Figure label="Humidity" value={fmtValue(rh.value, 0)} unit="%RH" size="md" /> : null}
        {pres ? (
          <Figure
            label="Pressure"
            value={fmtValue(pres.value, 1)}
            unit="hPa"
            size="md"
            sub={pres.note}
          />
        ) : null}
      </div>
      {day.length ? (
        <>
          <ChartCaption>Air temperature — last 24 hours (°C)</ChartCaption>
          <SeriesChart
            height={180}
            series={[
              {
                key: 'temp',
                label: 'Temperature',
                points: day,
                parameter: 'temperature',
                kind: 'area',
              },
            ]}
            thresholds={[
              { value: T.heat1.value, label: THRESHOLD_LABELS.tempHeat1, tone: 'critical' },
            ]}
          />
        </>
      ) : null}
    </Panel>
  );
}
