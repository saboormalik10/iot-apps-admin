'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, Wrench } from 'lucide-react';
import type {
  LocationId,
  Logger,
  MaintenanceState,
  PumpStationLive,
  StationLive,
} from '@/lib/api/types';
import {
  getMaintenance,
  getPumpStation,
  getStation,
  setMaintenance,
} from '@/lib/api/endpoints';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { StatusPill, stationTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { toast } from '@/lib/hooks/use-toast';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SHOW_EXTRAS } from '@/lib/extras';
import { TelemetryPanel } from './equipment-panel';
import { PumpRunLog, PumpStatusCard } from './pump-panels';
import { StationTabs } from './station-tabs';
import { ReadingCard, pointLabel } from './reading-card';
import { StationCharts } from './station-charts';
import { PowerPanel, PumpProtectionPanel } from './station-insights';

/**
 * A station, and — where one is fitted — its pump plant.
 *
 * Read top to bottom it answers the questions an operator arrives with, in
 * order: is anything over its line (the reading cards), what are the pumps doing
 * (the plant column), what has the weather been doing (the charts), and is the
 * station itself healthy (telemetry, power, equipment).
 *
 * On a desk the pumps sit in their own column beside the readings. The portal
 * monitors them only (client, 9 Nov 2026): ON/OFF from each pump's run signal and
 * a log of every run — the pump panel on site starts and stops them.
 */
export function StationPage({ id }: { id: LocationId }) {
  const now = useDemoClock();
  const [station, setStation] = useState<StationLive | null>(null);
  const [pump, setPump] = useState<PumpStationLive | null>(null);
  const [maintenance, setMaint] = useState<MaintenanceState | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    getStation(id)
      .then(setStation)
      .catch(() => setError(true));
    getPumpStation()
      .then(setPump)
      .catch(() => undefined);
    getMaintenance(id).then(setMaint);
  };
  const revision = useDataRevision();
  // Re-read on the minute and whenever the data (or the demo clock) moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id, revision, Math.floor(now / 60_000)]);

  if (error) return <ErrorState onRetry={load} />;
  if (!station || !now) return <LoadingState label="Loading the station…" />;

  const hasPump = Boolean(station.location.pumpStation);
  const anyRunning = pump?.pumps.some((p) => p.state === 'running');
  const minute = Math.floor(now / 60_000);

  const toggleMaintenance = async () => {
    const on = !maintenance?.on;
    await setMaintenance(id, on, on ? 'Planned work on site' : undefined);
    toast({
      variant: on ? 'warn' : 'success',
      title: on ? 'Maintenance mode on (simulated)' : 'Maintenance mode ended (simulated)',
      description: on
        ? 'Alerts from this location are marked as maintenance until it is ended. Recorded in the audit trail.'
        : 'Alerts from this location are live again. Recorded in the audit trail.',
    });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/"
            className={cn(
              'mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground',
              !SHOW_EXTRAS && 'hidden',
            )}
          >
            <ChevronLeft className="h-3 w-3" /> Corridor
          </Link>
          <h1 className="text-xl font-semibold">{station.location.name}</h1>
          {/* Figure 12's one line: location, chainage, what it measures, station ID. */}
          {!SHOW_EXTRAS ? (
            <p className="text-sm text-muted-foreground">
              Location {station.location.ordinal} · {station.location.chainage.label} ·{' '}
              {capabilitiesOf(station.location)} · station{' '}
              {station.location.loggers.map((l) => l.id).join(', ')}
            </p>
          ) : null}
          {/* What this location *does*, not what it is called internally. */}
          <p className={cn('text-sm text-muted-foreground', !SHOW_EXTRAS && 'hidden')}>
            Location {station.location.ordinal} · {capabilitiesOf(station.location)}
          </p>
          <p className={cn('mt-0.5 text-xs text-muted-foreground', !SHOW_EXTRAS && 'hidden')}>
            Chainage{' '}
            <span className="italic" title="Provisional — to be supplied by MTS">
              {station.location.chainage.label}
            </span>{' '}
            · logger {station.location.loggers.map((l) => l.id).join(', ')} ·{' '}
            <span
              className="italic"
              title="§15: final kilometrages and GPS positions are confirmed on site visits"
            >
              GPS position pending site survey
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill
            tone={stationTone(station.status)}
            label={
              station.status === 'alert'
                ? hasPump && anyRunning
                  ? 'Flood alert — pumps running'
                  : 'Alert'
                : undefined
            }
          />
          <p className="tabular text-xs text-muted-foreground">
            Last update {fmtTime(station.updatedAt)} · auto-refresh 30 s
          </p>
        </div>
      </div>

      {SHOW_EXTRAS ? <StationTabs id={id} active="live" /> : null}

      {/* §8.4: a Maintainer can put a location into maintenance mode. While it
          is on, everyone sees why — and that the float switch is still live. */}
      {/* Not in Figure 12: hidden (lib/extras.ts). */}
      {SHOW_EXTRAS && maintenance ? (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
            maintenance.on
              ? 'border-sev-warning/50 bg-sev-warning-tint text-sev-warning-strong'
              : 'bg-card text-muted-foreground',
          )}
        >
          <p className="flex min-w-0 items-start gap-2">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {maintenance.on ? (
              <span>
                <span className="font-semibold">Maintenance mode</span> since{' '}
                {fmtTime(maintenance.since!)} — {maintenance.by}. {maintenance.reason}
              </span>
            ) : (
              <span>
                Not in maintenance. A Maintainer puts a location into maintenance mode before
                working on site.
              </span>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={toggleMaintenance}>
            {maintenance.on ? 'End maintenance mode' : 'Start maintenance mode'}
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          'grid min-w-0 gap-4',
          hasPump && 'xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]',
        )}
      >
        <section className="order-1 min-w-0 xl:order-none xl:col-start-1 xl:row-start-1">
          <h2 className="mb-2 text-sm font-semibold">Live sensor readings</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {station.readings.map((r) => (
              <ReadingCard key={r.sensorId + r.parameter} reading={r} station={station.location} />
            ))}

            {/* Figure 12: station health is the fourth card of the grid, as rows. */}
            <article
              className={cn(
                'rounded-lg border bg-card p-3',
                (SHOW_EXTRAS || station.readings.length % 2 === 0) && 'sm:col-span-2',
              )}
            >
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Station health</h3>
                {station.location.loggers.some((l) => silent(l, now)) ? (
                  <StatusPill tone="warning" label="No data" size="sm" />
                ) : (
                  <StatusPill tone="normal" size="sm" />
                )}
              </header>
              <div className="space-y-2">
                {!SHOW_EXTRAS && station.readings.length % 2 === 1
                  ? station.location.loggers.map((l) => (
                      <dl key={l.id} className="text-xs">
                        {station.location.loggers.length > 1 ? (
                          <p className="font-medium">
                            {pointLabel(`-${l.id.includes('UP') ? 'UP' : 'DN'}-`) ?? l.label}
                          </p>
                        ) : null}
                        {loggerFacts(l, now).map((f) => (
                          <Row key={f.label} label={f.label} value={f.value} alert={f.alert} />
                        ))}
                      </dl>
                    ))
                  : null}
                {(SHOW_EXTRAS || station.readings.length % 2 === 0) &&
                  station.location.loggers.map((l) => (
                    <dl
                      key={l.id}
                      className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3"
                    >
                      {station.location.loggers.length > 1 ? (
                        <p className="col-span-2 font-medium sm:col-span-3">
                          {pointLabel(`-${l.id.includes('UP') ? 'UP' : 'DN'}-`) ?? l.label}
                        </p>
                      ) : null}
                      {loggerFacts(l, now).map((f) => (
                        <Fact key={f.label} label={f.label} value={f.value} alert={f.alert} />
                      ))}
                    </dl>
                  ))}
              </div>
            </article>
          </div>
        </section>

        {hasPump && pump ? (
          <div className="order-3 min-w-0 space-y-4 xl:order-none xl:col-start-2 xl:row-span-3 xl:row-start-1">
            <PumpStatusCard pump={pump} now={now} />
            <PumpRunLog runs={pump.runs} now={now} />
          </div>
        ) : null}

        <div className="order-2 min-w-0 space-y-4 xl:order-none xl:col-start-1 xl:row-start-2">
          {hasPump && SHOW_EXTRAS ? (
            <PumpProtectionPanel
              minuteKey={minute}
              pumps={pump?.pumps}
              rainMm={station.readings.find((r) => r.parameter === 'rainfall')?.value}
            />
          ) : null}
          <StationCharts station={station.location} now={now} />
          {SHOW_EXTRAS ? <PowerPanel locationId={id} minuteKey={minute} /> : null}
        </div>
      </div>

      {/* Drawings, wiring and the equipment list are on the Installation tab. */}
      {SHOW_EXTRAS ? <TelemetryPanel locationId={id} now={now} /> : null}


    </div>
  );
}

function Fact({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', alert && 'text-sev-warning-strong')}>{value}</dd>
    </div>
  );
}

/**
 * A logger that has sent nothing for 15 minutes. From the server a logger that is
 * down and a network that is down look the same, so the card says so rather than
 * claiming either (client, 9 Nov 2026).
 */
const SILENT_MS = 15 * 60_000;
function silent(l: Logger, now: number): boolean {
  return now - l.lastSeen > SILENT_MS;
}

/** What the health card says about one logger: battery, signal, and when it was last heard from. */
function loggerFacts(l: Logger, now: number): { label: string; value: string; alert?: boolean }[] {
  const quiet = silent(l, now);
  return [
    { label: 'Battery', value: `${l.batteryPct}% · ${l.charging ? 'solar charging' : 'on battery'}` },
    {
      label: 'Cellular',
      value: `${l.signal.network} · ${l.signal.rssiDbm} dBm (${l.signal.rssiDbm >= -85 ? 'good' : l.signal.rssiDbm >= -100 ? 'fair' : 'poor'})`,
    },
    quiet
      ? { label: 'Last connected', value: `No data since ${fmtDateTime(l.lastSeen)} — logger or network`, alert: true }
      : { label: 'Last connected', value: fmtDateTime(l.lastSeen) },
  ];
}

function Row({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium text-foreground', alert && 'text-sev-warning-strong')}>{value}</dd>
    </div>
  );
}

/** "Rain · Flood · Pump" — the words the corridor table and the nav use. */
function capabilitiesOf(location: StationLive['location']): string {
  const has = (p: string) => location.sensors.some((s) => s.parameter === p);
  const parts: string[] = [];
  if (has('rainfall')) parts.push('Rain');
  if (has('water_level') || has('float_switch')) parts.push('Flood');
  if (has('wind_mean') || has('wind_gust')) parts.push('Wind');
  if (has('temperature') || has('humidity')) parts.push('Temp & humidity');
  if (location.pumpStation) parts.push('Pump');
  return parts.join(' · ');
}
