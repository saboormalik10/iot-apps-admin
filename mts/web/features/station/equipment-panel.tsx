'use client';

import { CheckCircle2, Radio, Ruler } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LocationId, StaffGaugeCheck, StationLocation, Telemetry } from '@/lib/api/types';
import { staffGaugeChecks, telemetryFor } from '@/lib/api/endpoints';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INSTRUMENT_COMPLIANCE, type ComplianceStatus } from '@/lib/mock/seed/compliance';

/**
 * What is physically at this location, and how it is wired (§4.3, §5, §5.7).
 *
 * The client's own wiring schedule assigns every instrument to an OMC-048
 * terminal; this is that table for this one station, with each instrument's
 * mounting and the accuracy the proposal commits to. It is what a technician
 * reads before a site visit, and what a reviewer checks the sensor mix against.
 */
interface Kit {
  instrument: string;
  measures: string;
  interface: string;
  terminal: string;
  mounting: string;
  spec: string;
}

const KIT: Record<string, Kit> = {
  rainfall: {
    instrument: 'RIMCO 7499 tipping-bucket rain gauge',
    measures: 'Rainfall, 10-min to 3-day totals',
    interface: 'Digital pulse (reed switch)',
    terminal: 'DI1',
    mounting: 'Mast, 1.5–2 m, clear of splash',
    spec: '0.2 mm per tip · ±2 % ≤ 50 mm/hr · BOM standard',
  },
  water_level: {
    instrument: 'YGRD-65-D 120 GHz radar',
    measures: 'Water level above datum',
    interface: 'RS-485 Modbus RTU',
    terminal: 'RS-485 A/B',
    mounting: '2.5 m aluminium mast over the channel',
    spec: '±1 mm · 0.1 mm resolution · IP67 · 3° beam',
  },
  float_switch: {
    instrument: 'RS PRO RSF80 float switch (PPS, M12)',
    measures: 'High-level contact — backup pump trigger',
    interface: 'Volt-free contact, wired fail-safe',
    terminal: 'DI2',
    mounting: 'Through-wall, beside the radar',
    spec: 'Fixed trip height · no calibration · zero standby power',
  },
  gmx: {
    instrument: 'Gill GMX300 compact sensor',
    measures: 'Air temperature, humidity, barometric pressure',
    interface: 'SDI-12',
    terminal: 'SDI-12 / COM2',
    mounting: '1.5–2 m above rail, shaded, integrated radiation screen',
    spec: '±0.3 °C · 0.1 °C resolution',
  },
  wind: {
    instrument: 'Gill WindSonic 75 ultrasonic anemometer',
    measures: 'Wind speed and direction — 2-min mean, 3-s gust',
    interface: 'RS-232 serial',
    terminal: 'COM1',
    mounting: '10 m on a VM5F telescopic mast (11.3 m), lowers to 2.7 m for service',
    spec: '0–75 m/s (270 km/h) · direction 0–360°',
  },
};

export function EquipmentPanel({ station }: { station: StationLocation }) {
  const has = (p: string) => station.sensors.some((s) => s.parameter === p);
  const units = station.loggers.length > 1 ? station.loggers : [station.loggers[0]];
  const rows: (Kit & { count: number })[] = [];
  const add = (k: Kit, count = 1) => rows.push({ ...k, count });
  if (has('rainfall')) add(KIT.rainfall);
  if (has('water_level')) add(KIT.water_level, station.sensors.filter((s) => s.parameter === 'water_level').length);
  if (has('float_switch')) add(KIT.float_switch, station.sensors.filter((s) => s.parameter === 'float_switch').length);
  if (has('temperature')) add(KIT.gmx);
  if (has('wind_mean')) add(KIT.wind);
  if (station.pumpStation) {
    add({
      instrument: 'Existing pump control panel (integration)',
      measures: 'Run and trip status; start/stop demand to duty and standby',
      interface: 'Volt-free status in; relay outputs to contactor coils',
      terminal: 'DI3 · RO1 / RO2',
      mounting: 'Existing panel — Observator supplies the interface, not the pumps',
      spec: 'Switches the control circuit, never the motor supply',
    });
  }

  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Equipment at this location</h2>
        <p className="text-xs text-muted-foreground">
          Instruments, how each is wired to the OMC-048 (§4.3), and the station infrastructure (§5.7).
        </p>
      </header>
      <div className="scroll-x-hint overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {['Instrument', 'Measures', 'Wiring', 'Mounting', 'Specification'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.instrument} className="border-t align-top">
                <td className="px-4 py-2 font-medium">
                  {r.instrument}
                  {r.count > 1 ? <span className="ml-1 text-muted-foreground">× {r.count}</span> : null}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.measures}</td>
                <td className="px-4 py-2">
                  <span className="tabular rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{r.terminal}</span>
                  <span className="block text-xs text-muted-foreground">{r.interface}</span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.mounting}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.spec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-6 gap-y-2 border-t p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Data logger" value={`OMC-048 × ${units.length} · 1-minute logging · local alert and pump logic`} />
        <Fact label="Enclosure" value="316 stainless steel, IP66, lockable · ~1.3 m" />
        <Fact label="Power" value={`400 W panel, 2 × 55 Ah LiFePO₄, MPPT controller${units.length > 1 ? ' — per unit' : ''}`} />
        <Fact label="Communications" value={units.map((l) => `${l.signal.network} cellular`).join(' · ') + ' · store-and-forward'} />
        {has('water_level') ? (
          <Fact label="Manual staff gauge" value="Beside each radar, 10 mm graduations, same datum (§5.2)" />
        ) : null}
        {station.cameraUrl ? <Fact label="Camera" value="CIDS PTZ — linked in standing-water alerts (§7.5)" /> : null}
        <Fact label="Lightning & earthing" value="Air terminal, bonding to AS 1768, surge protection" />
        <Fact label="Siting" value="Clear of KE + 200 mm, outside transit space" />
      </dl>

      {/* §5.1–5.4: what the Statement of Requirements asks of each fitted instrument, and the answer. */}
      <div className="border-t px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement vs provided</h3>
        <div className="space-y-1.5">
          {(
            [
              has('rainfall') && 'rainfall',
              has('water_level') && 'level',
              has('temperature') && 'temperature',
              has('wind_mean') && 'wind',
            ].filter(Boolean) as (keyof typeof INSTRUMENT_COMPLIANCE)[]
          ).map((k) => {
            const c = INSTRUMENT_COMPLIANCE[k];
            const open = c.rows.filter((r) => r.status === 'confirm' || r.status === 'clarify').length;
            return (
              <details key={k} className="group rounded-md border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="font-medium">{c.title}</span> <span className="text-xs text-muted-foreground">{c.section}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-sev-normal-tint px-1.5 py-0.5 font-medium text-sev-normal-strong">
                      {c.rows.length - open} comply
                    </span>
                    {open ? (
                      <span className="rounded-full bg-sev-warning-tint px-1.5 py-0.5 font-medium text-sev-warning-strong">{open} to confirm</span>
                    ) : null}
                    <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </span>
                </summary>
                <div className="overflow-x-auto border-t">
                  <table className="w-full min-w-[560px] text-xs">
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.requirement} className="border-b align-top last:border-0">
                          <td className="w-[38%] px-3 py-1.5 text-muted-foreground">{r.requirement}</td>
                          <td className="px-3 py-1.5">{r.provided}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right">
                            <StatusChip status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatusChip({ status }: { status: ComplianceStatus }) {
  const map: Record<ComplianceStatus, { label: string; cls: string }> = {
    comply: { label: 'Comply', cls: 'bg-sev-normal-tint text-sev-normal-strong' },
    configurable: { label: 'Comply · configurable', cls: 'bg-sev-info-tint text-sev-info-strong' },
    confirm: { label: 'Comply · to confirm', cls: 'bg-sev-warning-tint text-sev-warning-strong' },
    clarify: { label: 'Comply · clarify', cls: 'bg-sev-warning-tint text-sev-warning-strong' },
  };
  return <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', map[status].cls)}>{map[status].label}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/**
 * How the station is talking to the server right now (§4, §8.5), and the last
 * time someone checked its radar against the staff gauge by eye (§5.2).
 */
export function TelemetryPanel({ locationId, now }: { locationId: LocationId; now: number }) {
  const [tel, setTel] = useState<Telemetry[] | null>(null);
  const [checks, setChecks] = useState<StaffGaugeCheck[] | null>(null);
  const minute = Math.floor(now / 60_000);
  useEffect(() => {
    telemetryFor(locationId).then(setTel);
    staffGaugeChecks(locationId).then(setChecks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, minute]);

  if (!tel) return <div className="h-48 animate-pulse rounded-lg border bg-muted/40" />;

  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">Telemetry and field checks</h2>
        <p className="text-xs text-muted-foreground">
          Logging every minute; routine sends every 5 minutes, and immediately on any threshold breach (§4).
        </p>
      </header>
      <div className="space-y-3">
        {tel.map((x) => (
          <div key={x.loggerId} className="rounded-md border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Radio className="h-4 w-4 text-muted-foreground" aria-hidden />
                {x.label} <span className="tabular text-xs font-normal text-muted-foreground">· {x.loggerId}</span>
              </p>
              {x.fastReporting ? (
                <span className="rounded-full bg-sev-warning-tint px-2 py-0.5 text-[11px] font-semibold text-sev-warning-strong">
                  Fast reporting — every minute
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Routine — every 5 min</span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
              <Fact label="Last transmission" value={fmtRelative(x.lastTransmission, now)} />
              <Fact label="Messages today" value={String(x.messagesToday)} />
              <Fact label="Event-triggered today" value={String(x.eventSendsToday)} />
              <Fact label="Buffered on logger" value={x.bufferedReadings ? String(x.bufferedReadings) : 'none — all delivered'} />
            </dl>
            {x.lastBackfill ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Last outage {fmtDateTime(x.lastBackfill.at - x.lastBackfill.gapMin * 60_000)}: {x.lastBackfill.readings} buffered readings
                forwarded on reconnection — no data lost (§8.5).
              </p>
            ) : null}
            {x.fastReporting ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                The level is above half the standing-water line, so the logger reports every minute (§5.2).
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {checks && checks.length ? (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" aria-hidden /> Staff gauge check
          </h3>
          <ul className="space-y-1.5">
            {checks.map((c) => {
              const diff = c.radarMm - c.staffMm;
              const ok = Math.abs(diff) <= 10;
              return (
                <li key={c.sensorId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <span>
                    <span className="font-medium">{c.label}</span> · {fmtDate(c.at)} · {c.by}
                  </span>
                  <span className="tabular">
                    gauge {c.staffMm} mm · radar {c.radarMm} mm ·{' '}
                    <span className={cn('inline-flex items-center gap-1 font-semibold', ok ? 'text-sev-normal-strong' : 'text-sev-alert-strong')}>
                      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
                      {diff >= 0 ? '+' : ''}
                      {diff} mm {ok ? 'within the gauge’s 10 mm steps' : 'investigate'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
