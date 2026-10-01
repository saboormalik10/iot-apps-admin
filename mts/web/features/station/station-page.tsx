'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, Play, Square, Wrench } from 'lucide-react';
import type { AlertEvent, LocationId, MaintenanceState, PumpCommandResult, PumpStationLive, StationLive } from '@/lib/api/types';
import {
  DEMO_USER,
  acknowledgeEvent,
  cameraEvents,
  commandPump,
  getMaintenance,
  getPumpStation,
  getStation,
  setMaintenance,
  setPumpMode,
} from '@/lib/api/endpoints';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { StatusPill, stationTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { toast } from '@/lib/hooks/use-toast';
import { fmtDuration, fmtSigned, fmtTime } from '@/lib/format';
import { ROLES_BY_ID } from '@/lib/mock/seed/people';
import { cn } from '@/lib/utils';
import { EquipmentPanel, TelemetryPanel } from './equipment-panel';
import { ReadingCard, pointLabel } from './reading-card';
import { StationCharts } from './station-charts';
import { PowerPanel, PumpHistoryPanel, PumpProtectionPanel } from './station-insights';
import { SiteElevation } from './site-elevation';
import { WiringDiagram } from './wiring-diagram';
import { PtzDialog } from '@/features/alerts/ptz-dialog';

/**
 * A station, and — where one is fitted — its pump plant.
 *
 * Read top to bottom it answers the questions an operator arrives with, in
 * order: is anything over its line (the reading cards), what are the pumps doing
 * (the plant column), what has the weather been doing (the charts), and is the
 * station itself healthy (telemetry, power, equipment).
 *
 * On a desk the plant sits in its own column beside the readings. On a phone it
 * comes straight after them — §8.1 and Figure 13 put pump control in the hands of
 * on-call staff, and a pump button below four charts and a power graph is a pump
 * button nobody finds in time.
 */
export function StationPage({ id }: { id: LocationId }) {
  const now = useDemoClock();
  const [station, setStation] = useState<StationLive | null>(null);
  const [pump, setPump] = useState<PumpStationLive | null>(null);
  const [maintenance, setMaint] = useState<MaintenanceState | null>(null);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<'start' | 'stop' | null>(null);
  const [result, setResult] = useState<PumpCommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ptz, setPtz] = useState<AlertEvent | null>(null);

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
  const dutyRunning = pump?.pumps.find((p) => p.role === 'duty')?.state === 'running';
  const level = station.readings.find((r) => r.parameter === 'water_level');
  const anyRunning = pump?.pumps.some((p) => p.state === 'running');
  const roleNames = DEMO_USER.roles.map((r) => ROLES_BY_ID[r].name).join(', ');
  const minute = Math.floor(now / 60_000);

  const runCommand = async (action: 'start' | 'stop') => {
    setBusy(true);
    const res = await commandPump({
      pumpId: 'MKV-PUMP-DUTY',
      action,
      mode: 'manual',
      confirmedBy: DEMO_USER.name,
    });
    setResult(res);
    setBusy(false);
    setConfirm(null);
    load();
  };

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
          <Link href="/" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Corridor
          </Link>
          <h1 className="text-xl font-semibold">{station.location.name}</h1>
          {/* What this location *does*, not what it is called internally. */}
          <p className="text-sm text-muted-foreground">
            Location {station.location.ordinal} · {capabilitiesOf(station.location)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chainage{' '}
            <span className="italic" title="Provisional — to be supplied by MTS">
              {station.location.chainage.label}
            </span>{' '}
            · logger {station.location.loggers.map((l) => l.id).join(', ')} ·{' '}
            <span className="italic" title="§15: final kilometrages and GPS positions are confirmed on site visits">
              GPS position pending site survey
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill
            tone={stationTone(station.status)}
            label={station.status === 'alert' ? (hasPump && anyRunning ? 'Flood alert — pumps running' : 'Alert') : undefined}
          />
          <p className="tabular text-xs text-muted-foreground">Last update {fmtTime(station.updatedAt)} · auto-refresh 30 s</p>
          {/* §7.5: where standing water wants verifying, the camera is one click from the station too. */}
          {station.location.cameraUrl ? (
            <Button
              size="sm"
              variant={station.cameraVerification ? 'default' : 'outline'}
              className={cn('mt-1', station.cameraVerification && 'bg-sev-alert text-white hover:bg-sev-alert/90')}
              onClick={() =>
                setPtz(cameraEvents().filter((e) => e.locationId === id).sort((a, b) => b.t - a.t)[0] ?? null)
              }
            >
              <Camera className={cn('h-4 w-4', station.cameraVerification && 'motion-safe:animate-pulse')} aria-hidden />
              {station.cameraVerification ? 'Verify on PTZ camera' : 'PTZ camera'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* §8.4: a Maintainer can put a location into maintenance mode. While it
          is on, everyone sees why — and that the float switch is still live. */}
      {maintenance ? (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
            maintenance.on ? 'border-sev-warning/50 bg-sev-warning-tint text-sev-warning-strong' : 'bg-card text-muted-foreground',
          )}
        >
          <p className="flex min-w-0 items-start gap-2">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {maintenance.on ? (
              <span>
                <span className="font-semibold">Maintenance mode</span> since {fmtTime(maintenance.since!)} — {maintenance.by}.{' '}
                {maintenance.reason}
              </span>
            ) : (
              <span>Not in maintenance. A Maintainer puts a location into maintenance mode before working on site.</span>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={toggleMaintenance}>
            {maintenance.on ? 'End maintenance mode' : 'Start maintenance mode'}
          </Button>
        </div>
      ) : null}

      <div className={cn('grid min-w-0 gap-4', hasPump && 'xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
        <section className="min-w-0 xl:col-start-1 xl:row-start-1">
          <h2 className="mb-2 text-sm font-semibold">Live sensor readings</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {station.readings.map((r) => (
              <ReadingCard key={r.sensorId + r.parameter} reading={r} station={station.location} />
            ))}

            <article className="rounded-lg border bg-card p-3 sm:col-span-2">
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Station health</h3>
                <StatusPill tone="normal" size="sm" />
              </header>
              <div className="space-y-2">
                {station.location.loggers.map((l) => (
                  <dl key={l.id} className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    {station.location.loggers.length > 1 ? (
                      <p className="col-span-2 font-medium sm:col-span-4">{pointLabel(`-${l.id.includes('UP') ? 'UP' : 'DN'}-`) ?? l.label}</p>
                    ) : null}
                    <Fact label="Battery" value={`${l.batteryPct}% · ${l.charging ? 'charging' : 'on battery'}`} />
                    <Fact
                      label="Cellular"
                      value={`${l.signal.network} · ${l.signal.rssiDbm} dBm (${l.signal.rssiDbm >= -85 ? 'good' : l.signal.rssiDbm >= -100 ? 'fair' : 'poor'})`}
                    />
                    <Fact label="Enclosure" value={`${l.enclosure.closed ? 'closed' : 'OPEN'} · ${l.enclosure.internalC} °C internal`} />
                    <Fact label="Logger" value={`${l.model} · ${l.id} · online`} />
                  </dl>
                ))}
              </div>
            </article>
          </div>
        </section>

        {hasPump && pump ? (
          <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-span-3 xl:row-start-1">
            <section className="rounded-lg border bg-card p-3">
              <header className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Pump station</h2>
                  <p className="text-xs text-muted-foreground">
                    1 duty + 1 standby · rotating pumps · up to {station.location.pumpStation!.capacityLps} L/s
                  </p>
                </div>
                <StatusPill tone={pump.state === 'running' ? 'normal' : 'information'} label={pump.state.toUpperCase()} size="sm" />
              </header>
              <ul className="space-y-2">
                {pump.pumps.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{p.role} pump</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {p.since
                          ? `since ${fmtTime(p.since)} · run ${fmtDuration(now - p.since)}`
                          : p.lastRun
                            ? `${p.note ?? 'armed'} · last run ${fmtTime(p.lastRun)}`
                            : p.note}
                        {' · '}
                        {p.runHoursToday} h today · {p.starts} {p.starts === 1 ? 'start' : 'starts'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                          p.state === 'running' ? 'bg-op-running-tint text-op-running' : 'bg-op-ready-tint text-op-ready',
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', p.state === 'running' ? 'bg-op-running' : 'bg-op-ready')} />
                        {p.state.toUpperCase()}
                      </span>
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">{p.flowLps} L/s</p>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Volume moved is what a duty manager asks after an event: run time
                  × the pumps' rated 60 L/s, from the same run hours as the cards. */}
              <p className="mt-2 flex flex-wrap justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Pumped today, approximately</span>
                <span className="tabular font-semibold">
                  {Math.round(pump.pumps.reduce((a, p) => a + p.runHoursToday * 3600 * 60, 0) / 1000).toLocaleString('en-AU')} m³
                </span>
              </p>
            </section>

            <section className="rounded-lg border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold">Pump condition (existing pumps)</h2>
              <div className="grid grid-cols-2 gap-2">
                <ConditionTile label="Stator temp" value={`${pump.condition.statorTempC} °C`} />
                <ConditionTile label="Water-in-oil" value={pump.condition.waterInOil} />
                <ConditionTile label="Insulation" value={`> ${pump.condition.insulationMohm} MΩ`} />
                <ConditionTile label="Bearing temp" value={`${pump.condition.bearingTempC} °C`} />
              </div>
            </section>

            <section className="rounded-lg border bg-card p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Control mode</h2>
                <div className="flex items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Control mode">
                    {(['auto', 'manual'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setPumpMode(m).then(load)}
                        aria-pressed={pump.mode === m}
                        className={cn(
                          'px-3 py-1.5 text-xs font-semibold uppercase transition-colors',
                          pump.mode === m
                            ? m === 'manual'
                              ? 'bg-op-manual text-black/80'
                              : 'bg-primary text-primary-foreground'
                            : 'bg-card text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {pump.mode === 'auto' ? (
                <p className="mb-3 text-xs text-muted-foreground">Switch to MANUAL to operate the pumps.</p>
              ) : (
                <p className="mb-3 text-xs font-medium text-op-manual">
                  MANUAL — automatic control is overridden. It returns to AUTO after the configured period.
                </p>
              )}

              {/* Start is offered only when the duty pump is stopped and stop only
                  when it is running. Offering both at all times meant confirming a
                  start on a pump that was already running, watching a command be
                  "accepted", and seeing nothing change — the one impression a
                  plant-control screen must never give. */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={pump.mode !== 'manual' || busy || dutyRunning}
                  onClick={() => setConfirm('start')}
                  className="bg-op-running text-white hover:bg-op-running/90"
                >
                  <Play className="h-4 w-4" /> Start duty pump
                </Button>
                <Button
                  disabled={pump.mode !== 'manual' || busy || !dutyRunning}
                  onClick={() => setConfirm('stop')}
                  className="bg-sev-alert text-white hover:bg-sev-alert/90"
                >
                  <Square className="h-4 w-4" /> Stop duty pump
                </Button>
              </div>
              {pump.mode === 'manual' ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {dutyRunning
                    ? 'The duty pump is running, so only STOP is available.'
                    : 'The duty pump is stopped, so only START is available.'}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Manual start/stop requires MANUAL mode and a confirmation. The action is authenticated, timestamped
                and logged.
              </p>
            </section>

            <PumpHistoryPanel minuteKey={Math.floor(now / 60_000)} />

            <section className="rounded-lg border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
              <ol className="space-y-2">
                {pump.activity.slice(0, 7).map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span
                      className={cn(
                        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                        a.severity === 'alert' ? 'bg-sev-alert' : a.severity === 'warning' ? 'bg-sev-warning' : 'bg-sev-info',
                      )}
                    />
                    <span className="tabular shrink-0 text-muted-foreground">{fmtTime(a.t)}</span>
                    <span className="min-w-0">
                      {a.text}
                      {a.simulated ? (
                        <span className="ml-1 rounded bg-muted px-1 text-[11px] uppercase text-muted-foreground">simulated</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}

        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-2">
          {/* What the logger is doing, from the logger's own set points. */}
          {hasPump ? (
            <PumpProtectionPanel
              minuteKey={minute}
              pumps={pump?.pumps}
              rainMm={station.readings.find((r) => r.parameter === 'rainfall')?.value}
            />
          ) : null}
          <StationCharts station={station.location} now={now} />
          <PowerPanel locationId={id} minuteKey={minute} />
        </div>
      </div>

      <section className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Site elevation — as installed</h2>
        <SiteElevation station={station.location} readings={station.readings} pumps={pump?.pumps} />
      </section>

      <section className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Wiring and connectivity — live</h2>
        <WiringDiagram station={station.location} readings={station.readings} pump={station.location.pumpStation ? pump : null} />
      </section>

      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <TelemetryPanel locationId={id} now={now} />
        <EquipmentPanel station={station.location} />
      </div>

      <PtzDialog event={ptz} onClose={() => setPtz(null)} onAcknowledge={(eid) => acknowledgeEvent(eid).then(load)} />

      {/* Confirmation. The dialog carries the prototype notice in its own body:
          this is the one screenshot that must never look like a real command. */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'start' ? 'Start the duty pump?' : 'Stop the duty pump?'}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <dl className="rounded-md border bg-muted/50 p-3 text-xs">
                  <Row label="Plant" value="Marrickville trackside pumps — DUTY" />
                  <Row label="Action" value={confirm === 'start' ? 'START (manual)' : 'STOP (manual)'} />
                  <Row label="Mode" value="MANUAL — automatic control overridden" />
                  <Row label="Authorised by" value={`${DEMO_USER.name} · ${roleNames}`} />
                  <Row label="Water level now" value={`${fmtSigned(level?.value ?? null)} mm`} />
                </dl>
                <p className="rounded-md border border-sev-info/40 bg-sev-info-tint p-2 text-xs text-sev-info-strong">
                  Prototype — no command is sent to any plant. In the delivered system this action is authenticated,
                  timestamped, written to the audit trail and alarmed to the control room.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => runCommand(confirm!)}
              disabled={busy}
              className={confirm === 'start' ? 'bg-op-running text-white hover:bg-op-running/90' : 'bg-sev-alert text-white hover:bg-sev-alert/90'}
            >
              {busy ? 'Sending…' : confirm === 'start' ? 'Start pump' : 'Stop pump'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The supervisory chain the real system will have. Showing it turns a fake
          button into a specification, and makes "it started" impossible to claim. */}
      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Command issued (simulated)</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm">{result?.message}</p>
                <ol className="space-y-1.5">
                  {result?.steps.map((s) => (
                    <li key={s.step} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <span className="capitalize">{stepLabel(s.step)}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[11px] font-medium',
                          s.state === 'done' ? 'bg-sev-normal-tint text-sev-normal-strong' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {s.state === 'done' ? `done ${s.at ? fmtTime(s.at) : ''}` : 'awaiting integration'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setResult(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ConditionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-sev-normal/30 bg-sev-normal-tint px-2.5 py-2">
      <div>
        <p className="text-[11px] text-sev-normal-strong/80">{label}</p>
        <p className="text-sm font-semibold capitalize text-sev-normal-strong">{value}</p>
      </div>
      <span className="h-2 w-2 rounded-full bg-sev-normal" aria-hidden />
    </div>
  );
}

function stepLabel(step: string): string {
  return {
    issued: 'Command issued',
    acknowledged: 'Received by the OMC-048',
    contactor: 'Pump-panel contactor energised',
    flow: 'Run confirmation and flow',
  }[step] ?? step;
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

