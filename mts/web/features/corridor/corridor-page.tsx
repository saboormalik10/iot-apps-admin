'use client';

import { Activity, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { StationLive } from '@/lib/api/types';
import { listStations, maintenanceNow } from '@/lib/api/endpoints';
import { CorridorMap } from '@/components/corridor/corridor-map';
import { GeoMap } from '@/components/corridor/geo-map';
import { StationQuickView } from './station-quick-view';
import { ExceedancePanel } from './exceedance-panel';
import { FloodPointsPanel } from './flood-points';
import { VigilancePanel } from './vigilance-panel';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { StatusPill, stationTone } from '@/components/status/status-pill';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtInt, fmtRelative, fmtSigned, fmtValue } from '@/lib/format';
import { STATUS_COLUMNS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';
import { SHOW_EXTRAS } from '@/lib/extras';

/**
 * The corridor view — the top-level screen MTS asked for.
 *
 * Two halves that answer different questions. The map answers "where is the
 * problem?" at a glance; the table underneath answers "what exactly is each
 * station reading, against which threshold?" and is also the accessible equivalent
 * of the map for anyone not using a pointer.
 *
 * The threshold in each column heading comes from the one file that holds those
 * numbers, so the heading can never drift from the rule that is actually applied.
 */
type MapView = 'plain' | 'map' | 'satellite';
const VIEW_KEY = 'mts.map-view';
const HEALTH_KEY = 'mts.show-station-health';
const VIEWS: { id: MapView; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'map', label: 'Map' },
  { id: 'satellite', label: 'Satellite' },
];

export function CorridorPage() {
  const now = useDemoClock();
  const revision = useDataRevision();
  const [stations, setStations] = useState<StationLive[] | null>(null);
  const [error, setError] = useState(false);
  /* Plain schematic, street map or satellite (client, 9 Nov 2026), remembered in
     this browser. Storage can be blocked; the plain view is the safe default. */
  const [view, setView] = useState<MapView>('plain');
  /* Battery and signal stay off the main page until asked for (client, 9 Nov 2026). */
  const [showHealth, setShowHealth] = useState(false);
  /* Clicking a station on the map opens its quick view (client, 9 Nov 2026). */
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'map' || saved === 'satellite' || saved === 'plain') setView(saved);
      setShowHealth(localStorage.getItem(HEALTH_KEY) === 'true');
    } catch {
      /* stay on plain, health hidden */
    }
  }, []);
  const toggleHealth = () => {
    setShowHealth(!showHealth);
    try {
      localStorage.setItem(HEALTH_KEY, String(!showHealth));
    } catch {
      /* not remembered, still toggled */
    }
  };
  const chooseView = (v: MapView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered, still switched */
    }
  };

  useEffect(() => {
    let live = true;
    listStations()
      .then((s) => live && setStations(s))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
    // The minute, and the data revision: time moves (or is moved by the demo
    // dock), and the corridor has to move with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 60_000), revision]);

  if (error) return <ErrorState onRetry={() => location.reload()} />;
  if (!stations) return <LoadingState label="Loading the corridor…" />;

  return (
    <div className="space-y-4">
      {/* Figure 6 opens straight on the map: the heading row is an extra. */}
      <div
        className={cn('flex flex-wrap items-end justify-between gap-2', !SHOW_EXTRAS && 'sr-only')}
      >
        <div>
          <h1 className="text-xl font-semibold">Corridor</h1>
          <p className="text-sm text-muted-foreground">
            Seven locations, eight loggers. Readings shown against their alert thresholds.
          </p>
        </div>
        <p className="tabular text-xs text-muted-foreground">
          Auto-refresh 10 min · updated {fmtRelative(stations[0].updatedAt, now)}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-end">
          <div className="inline-flex overflow-hidden rounded-md border bg-card" role="group" aria-label="Map background">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => chooseView(v.id)}
                aria-pressed={view === v.id}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  view === v.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {view === 'plain' ? (
          <CorridorMap
            stations={stations}
            showHealth={showHealth}
            onSelect={setSelected}
            className="aspect-[5/4] max-h-[560px] sm:aspect-[16/10] lg:aspect-[16/8]"
          />
        ) : (
          <GeoMap
            stations={stations}
            mapStyle={view}
            onSelect={setSelected}
            className="aspect-[5/4] max-h-[560px] sm:aspect-[16/10] lg:aspect-[16/8]"
          />
        )}
      </div>

      {/* On a phone the schematic is unreadable; the same stations as a list is
          what an on-call person actually needs at 2 a.m. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:hidden">
        {stations.map((s) => (
          <Link
            key={s.location.id}
            href={`/stations/${s.location.id}`}
            className="rounded-lg border bg-card p-3 hover:border-primary/40"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              {/* The number ties the card to the numbered pin above it. */}
              <span className="text-sm font-semibold leading-tight">
                <span className="text-muted-foreground">{s.location.ordinal}.</span>{' '}
                {s.location.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {maintenanceNow(s.location.id).on ? (
                  <Wrench
                    className="h-3.5 w-3.5 text-sev-warning-strong"
                    aria-label="In maintenance mode"
                  />
                ) : null}
                <StatusPill tone={stationTone(s.status)} size="sm" />
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {s.readings.slice(0, 4).map((r) => (
                <div
                  key={r.sensorId + r.parameter}
                  className="flex items-baseline justify-between gap-2"
                >
                  <dt className="truncate text-muted-foreground">
                    {label(r.parameter)}
                    {r.sensorId.includes('-UP-')
                      ? ' up'
                      : r.sensorId.includes('-DN-')
                        ? ' down'
                        : ''}
                  </dt>
                  <dd
                    className={cn(
                      'tabular font-medium',
                      r.status === 'alert' && 'text-sev-alert-strong',
                    )}
                  >
                    {value(r.parameter, r.value)}
                    <span className="ml-0.5 font-normal text-muted-foreground">{r.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>

      {/* Not in Figure 6: hidden (see lib/extras.ts). */}
      {SHOW_EXTRAS ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <VigilancePanel />
          <div className="min-w-0 space-y-4">
            <ExceedancePanel />
            <FloodPointsPanel stations={stations} minuteKey={Math.floor(now / 60_000)} />
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Station status — live readings vs alert thresholds
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{stations.length} locations</span>
            <Button size="sm" variant="outline" onClick={toggleHealth} aria-pressed={showHealth}>
              <Activity className="h-4 w-4" aria-hidden />
              {showHealth ? 'Hide station health' : 'Show station health'}
            </Button>
          </div>
        </header>
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {[
                  'Location',
                  STATUS_COLUMNS.rain,
                  STATUS_COLUMNS.wind,
                  STATUS_COLUMNS.temp,
                  'Water level',
                  'Pump',
                  ...(showHealth ? ['Battery', 'Signal'] : []),
                  'Updated',
                  'Status',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => {
                const get = (p: string) => s.readings.find((r) => r.parameter === p);
                const logger = s.location.loggers[0];
                return (
                  <tr key={s.location.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        href={`/stations/${s.location.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        <span className="text-muted-foreground">{s.location.ordinal}.</span>{' '}
                        {s.location.name}
                      </Link>
                    </td>
                    <Cell reading={get('rainfall')} />
                    <Cell reading={get('wind_mean')} />
                    <Cell reading={get('temperature')} />
                    <Cell reading={get('water_level')} signed />
                    <td className="tabular whitespace-nowrap px-3 py-2">
                      {s.location.pumpStation ? (
                        <span className="rounded bg-op-running-tint px-1.5 py-0.5 text-xs font-semibold text-op-running">
                          RUN
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    {showHealth ? (
                      <>
                        <td className="tabular whitespace-nowrap px-3 py-2">{logger.batteryPct}%</td>
                        <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {logger.signal.network} {logger.signal.rssiDbm}
                        </td>
                      </>
                    ) : null}
                    <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {fmtRelative(s.updatedAt, now)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          {maintenanceNow(s.location.id).on ? (
                            <Wrench
                              className="h-3.5 w-3.5 text-sev-warning-strong"
                              aria-label="In maintenance mode"
                            />
                          ) : null}
                          <StatusPill tone={stationTone(s.status)} size="sm" />
                        </span>
                        {maintenanceNow(s.location.id).on ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sev-warning-tint px-2 py-0.5 text-[11px] font-medium text-sev-warning-strong">
                            <Wrench className="h-3 w-3" aria-hidden /> Maintenance
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <StationQuickView
        station={stations.find((x) => x.location.id === selected) ?? null}
        now={now}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function Cell({
  reading,
  signed,
}: {
  reading?: { value: number | null; status: string; parameter: string };
  signed?: boolean;
}) {
  if (!reading) return <td className="px-3 py-2 text-muted-foreground">–</td>;
  const alert = reading.status === 'alert';
  const warn = reading.status === 'warning';
  return (
    <td
      className={cn(
        'tabular whitespace-nowrap px-3 py-2',
        alert && 'font-semibold text-sev-alert-strong',
        warn && 'font-medium text-sev-warning-strong',
      )}
    >
      {value(reading.parameter, reading.value, signed)}
      {alert ? ' ▲' : ''}
    </td>
  );
}

function label(parameter: string): string {
  const map: Record<string, string> = {
    rainfall: 'Rain',
    water_level: 'Level',
    temperature: 'Temp',
    humidity: 'RH',
    wind_mean: 'Wind',
    wind_gust: 'Gust',
    float_switch: 'Float',
  };
  return map[parameter] ?? parameter;
}

function value(parameter: string, v: number | null, signed?: boolean): string {
  if (v === null) return '–';
  if (parameter === 'float_switch') return v === 1 ? 'WET' : 'DRY';
  if (parameter === 'water_level' || signed) return fmtSigned(v);
  if (parameter === 'temperature' || parameter === 'humidity') return fmtValue(v, 1);
  return fmtInt(v);
}
