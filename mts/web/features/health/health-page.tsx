'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { HealthFinding, LocationId } from '@/lib/api/types';
import { chargeController, listHealth, loggerStrips } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { StatusPill, severityTone } from '@/components/status/status-pill';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import { fmtRelative, fmtTime, fmtValue } from '@/lib/format';
import { batteryPct } from '@/lib/mock/generate/profiles';
import { STATIONS } from '@/lib/mock/seed/stations';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';
import { HealthTabs } from './health-tabs';
import { WorkOrdersPanel } from './work-orders';
import { AvailabilityPanel, CalibrationPanel, MaintenanceNotice, QualityPanel } from './health-extras';

/**
 * System health.
 *
 * The client's documents name five conditions but draw no screen, so this is our
 * proposal. The obvious wrong answer is a list of devices with green ticks — that
 * tells you everything is fine right now and nothing about whether something is on
 * its way out. So the screen leads with a 24-hour availability strip per logger:
 * degradation shows up as gaps long before a station goes silent, which is exactly
 * what "leading indicator" is asking for.
 *
 * Power gets its own panel because the proposal singles it out — solar state of
 * charge, PV input and fault flags are alarmed as leading indicators of failure.
 */

const CONDITION_LABELS: Record<HealthFinding['condition'], string> = {
  inoperable: 'Inoperable',
  unresponsive: 'Unresponsive',
  'missing-sensor-data': 'Missing sensor data',
  'missing-pump-data': 'Missing pump data',
  'low-battery': 'Low battery',
};

/** The five conditions of §9, in the order the document lists them. */
const CONDITION_MATRIX: { id: HealthFinding['condition']; raisedWhen: string }[] = [
  { id: 'inoperable', raisedWhen: 'A logger reports a hardware or self-test failure.' },
  {
    id: 'unresponsive',
    raisedWhen: `No telemetry from a logger for ${THRESHOLDS.silenceMinutes} minutes.`,
  },
  { id: 'missing-sensor-data', raisedWhen: 'A fitted sensor stops reporting while its logger is still online.' },
  { id: 'missing-pump-data', raisedWhen: 'A pump station stops returning run state or flow.' },
  {
    id: 'low-battery',
    raisedWhen: `Battery state of charge below ${THRESHOLDS.power.lowBatteryPct}%, or solar input short of expectation.`,
  },
];

/**
 * The pairings of §7.4, as the proposal states them — by measurement, because
 * that is how the Statement of Requirements writes them (§3.3.3). `affects`
 * lists the locations whose sources are covered, so the "in use now" column can
 * be worked out from the live findings rather than typed in.
 */
const FALLBACKS: { measurement: string; primary: string; alternate: string; affects: LocationId[]; confirm?: string }[] = [
  {
    measurement: 'Rainfall',
    primary: 'Marrickville gauge (Loc 1)',
    alternate: 'Belmore triangle gauge (Loc 5) — and the reverse',
    affects: ['marrickville', 'belmore'],
  },
  {
    measurement: 'Flood level',
    primary: 'Radar at each water-level point (Loc 1–5)',
    alternate: 'Float switch at the same point, then CIDS PTZ camera monitoring',
    affects: ['marrickville', 'marrickville-dulwich-hill', 'canterbury', 'campsie', 'belmore'],
  },
  {
    measurement: 'Flood level — tunnel',
    primary: 'Up-tunnel unit (Loc 6)',
    alternate: 'Down-tunnel unit, cross-reading — and the reverse',
    affects: ['lady-game-drive'],
  },
  {
    measurement: 'Temperature',
    primary: 'GMX300 at Loc 2, 5 and 7',
    alternate: 'Belmore triangle, Bankstown Airport (BOM), Richmond (BOM)',
    affects: ['marrickville-dulwich-hill', 'belmore', 'windsor-road'],
  },
  {
    measurement: 'Wind',
    primary: 'Belmore triangle (Loc 5)',
    alternate: '“Marrickville station” per §7.4',
    affects: ['belmore', 'marrickville-dulwich-hill'],
    confirm: 'Location 1 has no anemometer in §6 — the nearest is Loc 2 (Marrickville–Dulwich Hill). To confirm with MTS.',
  },
  {
    measurement: 'Wind — north-west',
    primary: 'Windsor Road SSC (Loc 7)',
    alternate: 'Not named in §7.4',
    affects: ['windsor-road'],
    confirm: 'No alternate is specified for Windsor Road. To confirm with MTS.',
  },
];

export function HealthPage() {
  const now = useDemoClock();
  const [findings, setFindings] = useState<HealthFinding[] | null>(null);
  const revision = useDataRevision();

  useEffect(() => {
    listHealth().then(setFindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 600_000), revision]);

  const loggers = STATIONS.flatMap((s) => s.loggers.map((l) => ({ station: s, logger: l })));
  const tenMin = Math.floor(now / 600_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const strips = useMemo(() => (now ? loggerStrips() : []), [tenMin, revision]);

  if (!now) return <LoadingState label="Loading…" />;

  if (!findings) return <LoadingState label="Checking the fleet…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">System health</h1>
          <p className="text-sm text-muted-foreground">
            Refreshed every 10 minutes. Inoperable, unresponsive, missing sensor or pump data, and low battery.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Last refresh {fmtRelative(tenMin * 600_000, now)}</p>
      </div>
      <HealthTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Loggers reporting" value={`${loggers.length}/${loggers.length}`} tone="normal" />
        <Kpi label="Conditions raised" value={String(findings.length)} tone={findings.length ? 'warning' : 'normal'} />
        <Kpi label="Lowest battery" value={`${Math.min(...loggers.map((l) => batteryPct(l.logger.id, now)))}%`} tone="normal" />
        <Kpi label="Pump data gaps (24 h)" value="0" tone="normal" />
      </div>

      <MaintenanceNotice now={now} />

      {/* §9 names five conditions and §7.1 puts a delivery obligation on each. A
          list of what happens to be wrong right now never shows the other four, so
          the screen states all five and what each one means. */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Monitored conditions</h2>
          <p className="text-xs text-muted-foreground">
            Every condition the system watches for, how it is detected, and how quickly the notification must reach
            its recipients.
          </p>
        </header>
        {/* On a phone: one card per condition, so "raised when" is readable. */}
        <ul className="divide-y md:hidden">
          {CONDITION_MATRIX.map((c) => {
            const live = findings.filter((f) => f.condition === c.id);
            return (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{CONDITION_LABELS[c.id]}</p>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', live.length ? 'bg-sev-warning-tint text-sev-warning-strong' : 'bg-sev-normal-tint text-sev-normal-strong')}>
                    {live.length ? `${live.length} raised` : 'Clear'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.raisedWhen} Notify within {THRESHOLDS.deliveryMinutes.systemFault} min.
                </p>
              </li>
            );
          })}
        </ul>
        <div className="scroll-x-hint hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60">
              <tr>
                {['Condition', 'Raised when', 'Notify within', 'Now'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONDITION_MATRIX.map((c) => {
                const live = findings.filter((f) => f.condition === c.id);
                return (
                  <tr key={c.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{CONDITION_LABELS[c.id]}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.raisedWhen}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {THRESHOLDS.deliveryMinutes.systemFault} min
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {live.length ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warning-tint px-2 py-0.5 text-xs font-medium text-sev-warning-strong">
                          <span className="h-1.5 w-1.5 rounded-full bg-sev-warning" />
                          {live.length} raised
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-normal-tint px-2 py-0.5 text-xs font-medium text-sev-normal-strong">
                          <span className="h-1.5 w-1.5 rounded-full bg-sev-normal" />
                          Clear
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <WorkOrdersPanel now={now} />

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold">Availability — last 24 hours</h2>
          <p className="text-xs text-muted-foreground">
            Each cell is twenty minutes. A gap is a reporting interruption, which usually shows before a station is
            declared unresponsive. Hover a cell for its time and cause.
          </p>
        </header>
        <ul className="space-y-2">
          {loggers.map(({ station, logger }) => (
            <li key={logger.id} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,230px)_1fr] sm:gap-3">
              <div className="min-w-0">
                {/* The tunnel has two loggers and they were both truncating to the
                    same string — "Lady Game Drive (tunnel)…" twice, with only the
                    id to tell them apart. */}
                <Link href={`/stations/${station.id}`} className="block text-sm leading-tight hover:text-primary hover:underline">
                  {station.loggers.length > 1 ? `${station.name} — ${logger.label}` : station.name}
                </Link>
                <span className="tabular text-[11px] text-muted-foreground">{logger.id}</span>
              </div>
              <div className="flex h-5 gap-[1px] overflow-hidden rounded" role="img" aria-label={stripLabel(strips.find((x) => x.loggerId === logger.id))}>
                {(strips.find((x) => x.loggerId === logger.id)?.cells ?? []).map((c) => (
                  <span
                    key={c.from}
                    className={cn(
                      'h-full flex-1',
                      c.state === 'silent' ? 'bg-sev-offline' : c.state === 'partial' ? 'bg-sev-warning' : 'bg-sev-normal/70',
                    )}
                    title={`${fmtTime(c.from)}–${fmtTime(c.to)} · ${c.note ?? 'Reporting'}`}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        {strips[0] ? (
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-[minmax(0,230px)_1fr] sm:gap-3">
            <span className="hidden sm:block" />
            <div className="tabular flex justify-between text-[10px] text-muted-foreground" aria-hidden>
              {[0, 0.25, 0.5, 0.75].map((f) => {
                const cells = strips[0].cells;
                const c = cells[Math.floor(f * cells.length)];
                return <span key={f}>{c ? fmtTime(c.from) : ''}</span>;
              })}
              <span>now</span>
            </div>
          </div>
        ) : null}
        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-sev-normal/70" /> reporting
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-sev-warning" /> a sensor not reporting
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-sev-offline" /> logger silent
          </span>
        </p>
      </section>

      <AvailabilityPanel />

      {/* §7.4: when a source fails, alerting for that location continues from its
          designated alternate, and the alert says so. Stating it as a table is the
          only way a client can check the pairing is the one they intended. */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Redundancy — designated alternate sources</h2>
          <p className="text-xs text-muted-foreground">
            If the primary source stops reporting, alerting for the location continues from the alternate and the
            alert wording states the additional section it covers.
          </p>
        </header>
        <ul className="divide-y md:hidden">
          {FALLBACKS.map((f) => (
            <li key={f.measurement} className="px-4 py-3 text-xs">
              <p className="text-sm font-medium">{f.measurement}</p>
              <p className="mt-0.5 text-muted-foreground">
                <span className="text-foreground">Primary:</span> {f.primary}
              </p>
              <p className="text-muted-foreground">
                <span className="text-foreground">Alternate:</span> {f.alternate}
              </p>
              {f.confirm ? <p className="mt-0.5 text-sev-warning-strong">⚠ {f.confirm}</p> : null}
            </li>
          ))}
        </ul>
        <div className="scroll-x-hint hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60">
              <tr>
                {['Measurement', 'Primary source', 'Designated alternate (§7.4)', 'In use now'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FALLBACKS.map((f) => {
                /* Only a source that is actually out forces the fallback — a
                   battery warning, or an outage that has since recovered, does
                   not. The flood rows are the ones a failed radar affects. */
                const out = findings.filter(
                  (x) =>
                    f.affects.includes(x.locationId) &&
                    f.measurement.startsWith('Flood') === (x.loggerId?.includes('YGRD') ?? false) &&
                    (x.condition === 'missing-sensor-data' || x.condition === 'inoperable'),
                );
                return (
                  <tr key={f.measurement} className="border-t align-top">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{f.measurement}</td>
                    <td className="px-4 py-2 text-muted-foreground">{f.primary}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {f.alternate}
                      {f.confirm ? (
                        <span className="mt-0.5 block text-[11px] text-sev-warning-strong">⚠ {f.confirm}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {out.length ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warning-tint px-2 py-0.5 text-xs font-medium text-sev-warning-strong">
                          <span className="h-1.5 w-1.5 rounded-full bg-sev-warning" />
                          Alternate at {out.map((x) => x.locationName).join(', ')}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Primary</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Conditions raised</h2>
        </header>
        {findings.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing is degraded.</p>
        ) : (
          <ul className="divide-y">
            {findings.map((f, i) => (
              <li key={i} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
                <StatusPill tone={severityTone(f.severity)} size="sm" className="mt-0.5 self-start" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {CONDITION_LABELS[f.condition]} — {f.locationName}
                  </p>
                  <p className="text-xs text-muted-foreground">{f.detail}</p>
                </div>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {f.loggerId} · since {fmtRelative(f.since, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <QualityPanel />
        <CalibrationPanel now={now} />
      </div>

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold">Power — solar and battery</h2>
          <p className="text-xs text-muted-foreground">
            400 W array, 2 × 55 Ah LiFePO₄ per station. The solar charge controller reports state of charge, PV input,
            charge or discharge and its fault flags to the logger (§8.6); each is alarmed as a leading indicator of
            failure, low charge below {THRESHOLDS.power.lowBatteryPct}%.
          </p>
        </header>
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted">
              <tr>
                {['Logger', 'State of charge', 'Battery', 'PV input', 'Charge / discharge', 'Controller flags', 'Enclosure', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loggers.map(({ station, logger }) => {
                const cc = chargeController(logger.id);
                const soc = cc.socPct;
                const raised = cc.flags.filter((f) => f.active);
                const low = soc <= THRESHOLDS.power.lowBatteryPct || raised.length > 0;
                return (
                  <tr key={logger.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-medium">{station.name}</span>
                      {station.loggers.length > 1 ? (
                        <span className="text-muted-foreground"> — {logger.label}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', low ? 'bg-sev-warning' : 'bg-sev-normal')}
                            style={{ width: `${soc}%` }}
                          />
                        </div>
                        <span className="tabular text-xs">{soc}%</span>
                      </div>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2">{fmtValue(cc.batteryV, 2)} V</td>
                    <td className="tabular whitespace-nowrap px-3 py-2">{fmtValue(cc.pvW, 0)} W</td>
                    <td className="tabular whitespace-nowrap px-3 py-2">
                      {cc.netA > 0 ? '+' : ''}
                      {fmtValue(cc.netA, 1)} A{' '}
                      <span className="text-muted-foreground">{cc.netA > 0.05 ? 'charging' : cc.netA < -0.05 ? 'discharging' : 'float'}</span>
                    </td>
                    <td className="px-3 py-2" title={cc.flags.map((f) => `${f.label}: ${f.active ? 'RAISED' : 'clear'}`).join('\n')}>
                      {raised.length ? (
                        <span className="flex flex-wrap gap-1">
                          {raised.map((f) => (
                            <span key={f.id} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sev-warning-tint px-2 py-0.5 text-[11px] font-medium text-sev-warning-strong">
                              <span className="h-1.5 w-1.5 rounded-full bg-sev-warning" aria-hidden />
                              {f.label}
                              {f.since ? <span className="font-normal"> · {fmtRelative(f.since, now)}</span> : null}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">None of {cc.flags.length}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">closed · {logger.enclosure.internalC} °C</td>
                    <td className="px-3 py-2">
                      <StatusPill tone={low ? 'warning' : 'normal'} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Flags monitored on every controller: {chargeController(loggers[0].logger.id).flags.map((f) => f.label.toLowerCase()).join(', ')}.
          Hover a row for each flag&apos;s state.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'normal' | 'warning' }) {
  return (
    <div className={cn('rounded-lg border-l-4 bg-card p-3 ring-1 ring-border', tone === 'warning' ? 'border-l-sev-warning' : 'border-l-sev-normal')}>
      <p className="tabular text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** The strip in words, for a screen reader: where the gaps were and why. */
function stripLabel(strip: { cells: { from: number; to: number; state: string; note?: string }[] } | undefined): string {
  if (!strip) return 'No data';
  const gaps: string[] = [];
  let open: { from: number; to: number; note?: string } | null = null;
  for (const c of strip.cells) {
    if (c.state !== 'ok') {
      if (open && open.note === c.note) open.to = c.to;
      else {
        if (open) gaps.push(`${fmtTime(open.from)}–${fmtTime(open.to)} ${open.note ?? ''}`);
        open = { from: c.from, to: c.to, note: c.note };
      }
    } else if (open) {
      gaps.push(`${fmtTime(open.from)}–${fmtTime(open.to)} ${open.note ?? ''}`);
      open = null;
    }
  }
  if (open) gaps.push(`${fmtTime(open.from)}–now ${open.note ?? ''}`);
  return gaps.length ? `Last 24 hours: ${gaps.join('; ')}` : 'Reporting throughout the last 24 hours';
}
