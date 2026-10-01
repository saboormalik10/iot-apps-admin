'use client';

import { useEffect, useState } from 'react';
import type { LiveReading, PumpStationLive, StationLocation, Telemetry } from '@/lib/api/types';
import { chargeController, telemetryFor } from '@/lib/api/endpoints';
import { fmtSigned, fmtTime, fmtValue } from '@/lib/format';
import { TERMINAL_FOR, type WireKind } from '@/lib/mock/seed/wiring';
import { cn } from '@/lib/utils';

/**
 * Figure 3 and §6.1, live: how this station is wired.
 *
 * The proposal draws one fully-populated station — every sensor on its OMC-048
 * terminal, the relays to the pump panel, the solar chain, the modem — and then
 * one architecture per location showing only what is fitted. This is that, for
 * this location, with the state of every connection on it: a value on each
 * sensor, the relays drawn closed while a pump runs, the signal and last send on
 * the modem, charge on the battery. Campsie's cut RS-485 cable is drawn cut.
 *
 * Wire colours follow the signal type, as Figure 3's legend does — never status,
 * which stays on the dots and words. Power is ink rather than red: on this
 * product red means an alarm.
 */

const W = 820;
const LOG_X = 300;
const LOG_W = 220;
const SENSOR_W = 200;
const STRIDE = 54;

const WIRE: Record<WireKind | 'zero' | 'cell', { stroke: string; dash?: string; width: number; label: string }> = {
  signal: { stroke: 'hsl(var(--chart-1))', width: 1.6, label: 'Signal — digital / pulse' },
  serial: { stroke: 'hsl(var(--chart-3))', width: 1.6, label: 'Serial — RS-232 / RS-485 / SDI-12' },
  relay: { stroke: 'hsl(var(--chart-2))', width: 2, label: 'Relay output → pump contactor' },
  power: { stroke: 'hsl(var(--foreground))', width: 2, label: 'Power +12 VDC' },
  zero: { stroke: 'hsl(var(--muted-foreground))', dash: '3 3', width: 1.2, label: '0 V / earth' },
  cell: { stroke: 'hsl(var(--chart-6))', dash: '6 4', width: 1.4, label: 'Cellular 4G / 5G' },
};

const INK = 'hsl(var(--foreground))';
const MUTED = 'hsl(var(--muted-foreground))';
const HALO = { paintOrder: 'stroke' as const, stroke: 'hsl(var(--card))', strokeWidth: 3, strokeLinejoin: 'round' as const };

const DOT: Record<string, string> = {
  normal: 'hsl(var(--sev-normal))',
  warning: 'hsl(var(--sev-warning))',
  alert: 'hsl(var(--sev-alert))',
  offline: 'hsl(var(--sev-offline))',
};

export function WiringDiagram({
  station,
  readings,
  pump,
}: {
  station: StationLocation;
  readings: LiveReading[];
  pump?: PumpStationLive | null;
}) {
  const [unit, setUnit] = useState(0);
  const [tel, setTel] = useState<Telemetry[] | null>(null);
  useEffect(() => {
    telemetryFor(station.id).then(setTel);
  }, [station.id, readings]);

  const logger = station.loggers[Math.min(unit, station.loggers.length - 1)];
  const prefix = logger.id.replace(/-\d+$/, '-');
  const t = tel?.find((x) => x.loggerId === logger.id);
  const cc = chargeController(logger.id);

  /* One box per instrument on this logger: the GMX300 is one device for three
     parameters, the WindSonic one for mean, gust and direction. */
  const order: string[] = ['rainfall', 'float_switch', 'wind_mean', 'water_level', 'temperature'];
  const sensors = order
    .map((p) => station.sensors.find((s) => s.parameter === p && s.sensorId.startsWith(prefix)))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const read = (param: string) => readings.find((r) => r.parameter === param && r.sensorId.startsWith(prefix));

  const top = 96;
  const logH = Math.max(230, sensors.length * STRIDE + 40);
  const logBottom = top + logH;
  const powerY = logBottom + 54;
  const H = powerY + 52;
  const sy = (i: number) => top + 30 + i * STRIDE;
  const pumpsHere = Boolean(station.pumpStation && pump);

  return (
    <figure className="min-w-0 space-y-2">
      {station.loggers.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Monitoring unit">
            {station.loggers.map((l, i) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={unit === i}
                onClick={() => setUnit(i)}
                className={cn('px-3 py-1.5', unit === i ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {l.label} · {l.id}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">
            Two self-contained units — each its own logger, panel, battery and modem, so a fault in one cannot take out
            the other (§6, Location 6).
          </span>
        </div>
      ) : null}

      <div className="scroll-x-hint overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full min-w-[640px] rounded-md border bg-muted/20"
          role="img"
          aria-label={`${station.name} — ${logger.id} wiring and connectivity, live`}
        >
          {/* ── modem and server ─────────────────────────────────────── */}
          <Box x={LOG_X + 40} y={14} w={140} h={44} title="Cellular modem" sub={`${logger.signal.network} · ${logger.signal.rssiDbm} dBm`} />
          <line x1={LOG_X + LOG_W / 2} x2={LOG_X + LOG_W / 2} y1={58} y2={top} stroke={WIRE.serial.stroke} strokeWidth={1.6} />
          <text x={LOG_X + LOG_W / 2 + 6} y={80} fontSize="8.5" fill={MUTED} {...HALO}>
            modem / USB
          </text>
          <Box x={600} y={10} w={200} h={52} title="Central server" sub="portal · alert engine · history" tone="primary" />
          <path d={`M ${LOG_X + 180},36 L 600,36`} stroke={WIRE.cell.stroke} strokeDasharray={WIRE.cell.dash} strokeWidth={WIRE.cell.width} fill="none" />
          <text x={(LOG_X + 180 + 600) / 2} y={52} fontSize="8.5" textAnchor="middle" fill={MUTED} {...HALO}>
            {t ? `sent ${fmtTime(t.lastTransmission)} · ${t.bufferedReadings ? `${t.bufferedReadings} buffered` : '0 buffered'}` : 'secure link'}
          </text>

          {/* ── the logger ───────────────────────────────────────────── */}
          <rect x={LOG_X} y={top} width={LOG_W} height={logH} rx={6} fill="hsl(var(--primary) / 0.06)" stroke="hsl(var(--primary))" strokeWidth={1.5} />
          <rect x={LOG_X} y={top} width={LOG_W} height={24} rx={6} fill="hsl(var(--primary))" />
          <text x={LOG_X + LOG_W / 2} y={top + 16} fontSize="10" fontWeight="700" textAnchor="middle" fill="hsl(var(--primary-foreground))">
            OMC-048 · {logger.id}
          </text>
          <text x={LOG_X + LOG_W / 2} y={top + 38} fontSize="8" textAnchor="middle" fill={MUTED}>
            field cabinet (IP66) · {logger.enclosure.closed ? 'door closed' : 'DOOR OPEN'} · {logger.enclosure.internalC} °C
          </text>
          <text x={LOG_X + LOG_W / 2} y={logBottom - 46} fontSize="8.5" fontWeight="600" textAnchor="middle" fill={INK}>
            scriptable logic
          </text>
          <text x={LOG_X + LOG_W / 2} y={logBottom - 34} fontSize="8" textAnchor="middle" fill={MUTED}>
            1-min logging · thresholds · {pumpsHere ? 'pump control · ' : ''}store-and-forward
          </text>
          <text x={LOG_X + LOG_W / 2} y={logBottom - 23} fontSize="8" textAnchor="middle" fill={MUTED}>
            {t ? `${t.fastReporting ? 'fast reporting — every minute' : `routine — every ${t.transmitIntervalMin} min`} · ${t.messagesToday} msgs today` : ''}
          </text>

          {/* ── sensors, each on its terminal ────────────────────────── */}
          {sensors.map((s, i) => {
            const term = TERMINAL_FOR[s.parameter]!;
            const r = read(s.parameter);
            const y = sy(i);
            const dead = r?.value === null;
            const wire = WIRE[term.kind];
            const value =
              r?.value === null || r === undefined
                ? 'no response'
                : s.parameter === 'float_switch'
                  ? r.value === 1
                    ? 'WET'
                    : 'dry'
                  : s.parameter === 'water_level'
                    ? `${fmtSigned(r.value)} mm`
                    : s.parameter === 'rainfall'
                      ? `${fmtValue(r.value)} mm / 1 h`
                      : s.parameter === 'temperature'
                        ? `${fmtValue(r.value)} °C · ${fmtValue(read('humidity')?.value, 0)} %RH`
                        : `${fmtValue(r.value, 0)} km/h · gust ${fmtValue(read('wind_gust')?.value, 0)}`;
            const status = dead ? 'offline' : r?.status ?? 'normal';
            return (
              <g key={s.sensorId}>
                <Box x={30} y={y - 20} w={SENSOR_W} h={40} title={term.device} sub={value} dot={DOT[status] ?? DOT.normal} />
                <line
                  x1={30 + SENSOR_W}
                  x2={LOG_X}
                  y1={y}
                  y2={y}
                  stroke={dead ? MUTED : wire.stroke}
                  strokeWidth={wire.width}
                  strokeDasharray={dead ? '2 4' : undefined}
                >
                  <title>{`${term.terminal} · ${term.interface} · ${term.cable} · ${term.cores}`}</title>
                </line>
                {dead ? (
                  <g transform={`translate(${(30 + SENSOR_W + LOG_X) / 2}, ${y})`}>
                    <path d="M -5,-5 L 5,5 M -5,5 L 5,-5" stroke="hsl(var(--sev-alert))" strokeWidth={2} />
                  </g>
                ) : null}
                <text x={(30 + SENSOR_W + LOG_X) / 2} y={dead ? y - 9 : y - 5} fontSize="8" textAnchor="middle" fill={dead ? 'hsl(var(--sev-alert-strong))' : MUTED} {...HALO}>
                  {dead ? 'no response — comms timeout' : term.wire}
                </text>
                <circle cx={LOG_X} cy={y} r={3} fill="hsl(var(--card))" stroke={INK} />
                <text x={LOG_X + 8} y={y + 3} fontSize="8.5" fontWeight="600" fill={INK}>
                  {term.terminal}
                </text>
              </g>
            );
          })}

          {/* ── the pump panel, at Marrickville only ─────────────────── */}
          {pumpsHere && pump ? (
            <g>
              <rect x={600} y={top} width={200} height={128} rx={6} fill="hsl(var(--sev-warning-tint))" stroke="hsl(var(--sev-warning))" />
              <text x={700} y={top + 16} fontSize="9.5" fontWeight="700" textAnchor="middle" fill={INK}>
                Existing pump control panel (240 V)
              </text>
              {pump.pumps.slice(0, 2).map((p, i) => {
                const y = top + 40 + i * 34;
                const on = p.state === 'running';
                return (
                  <g key={p.id}>
                    <rect x={612} y={y - 12} width={176} height={24} rx={4} fill="hsl(var(--card))" stroke={on ? 'hsl(var(--op-running))' : MUTED} />
                    <text x={620} y={y + 3} fontSize="8.5" fill={INK}>
                      K{i + 1} → {p.role === 'duty' ? 'Duty' : 'Standby'} pump 60 L/s
                    </text>
                    <text x={782} y={y + 3} fontSize="8" fontWeight="700" textAnchor="end" fill={on ? 'hsl(var(--sev-normal-strong))' : MUTED}>
                      {on ? 'RUN' : p.state.toUpperCase()}
                    </text>
                    {/* RO1 / RO2 — drawn closed while the pump runs */}
                    <line x1={LOG_X + LOG_W} x2={560} y1={y} y2={y} stroke={WIRE.relay.stroke} strokeWidth={WIRE.relay.width} />
                    <line
                      x1={560}
                      y1={y}
                      x2={on ? 584 : 580}
                      y2={on ? y : y - 9}
                      stroke={WIRE.relay.stroke}
                      strokeWidth={WIRE.relay.width}
                    />
                    <line x1={586} x2={612} y1={y} y2={y} stroke={WIRE.relay.stroke} strokeWidth={WIRE.relay.width} />
                    <circle cx={LOG_X + LOG_W} cy={y} r={3} fill="hsl(var(--card))" stroke={INK} />
                    <text x={LOG_X + LOG_W - 8} y={y + 3} fontSize="8.5" fontWeight="600" textAnchor="end" fill={INK}>
                      RO{i + 1}
                    </text>
                    <text x={572} y={y - 12} fontSize="7.5" textAnchor="middle" fill={MUTED} {...HALO}>
                      {on ? 'closed' : 'open'}
                    </text>
                  </g>
                );
              })}
              <text x={700} y={top + 118} fontSize="8" textAnchor="middle" fill={MUTED}>
                240 V GPO supply · mode {pump.mode.toUpperCase()}
              </text>
              {/* DI3: run / trip back from the panel */}
              <path
                d={`M 650,${top + 128} L 650,${top + 150} L ${LOG_X + LOG_W},${top + 150}`}
                fill="none"
                stroke={WIRE.signal.stroke}
                strokeWidth={WIRE.signal.width}
                strokeDasharray="5 3"
              />
              <circle cx={LOG_X + LOG_W} cy={top + 150} r={3} fill="hsl(var(--card))" stroke={INK} />
              <text x={LOG_X + LOG_W - 8} y={top + 153} fontSize="8.5" fontWeight="600" textAnchor="end" fill={INK}>
                DI3
              </text>
              <text x={590} y={top + 146} fontSize="8" textAnchor="middle" fill={MUTED} {...HALO}>
                run / trip — {pump.pumps.some((p) => p.state === 'fault') ? 'TRIP' : 'no trip'}
              </text>
              <Box x={600} y={top + 168} w={200} h={40} title="Pump condition monitoring" sub="where available — temp, seals, insulation" dashed />
              <path
                d={`M 600,${top + 188} L 560,${top + 188} L 560,${top + 158} L ${LOG_X + LOG_W},${top + 158}`}
                fill="none"
                stroke={WIRE.serial.stroke}
                strokeWidth={1.2}
                strokeDasharray="2 3"
              />
            </g>
          ) : (
            /* §6.1's "this location" panel, where there is no plant to draw */
            <g>
              <rect x={600} y={top} width={200} height={128} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
              <text x={612} y={top + 18} fontSize="9.5" fontWeight="700" fill={INK}>
                This location
              </text>
              {[
                ['Parameters', capabilities(station)],
                ['Sensors fitted', String(sensors.length)],
                ['Telemetry', `${logger.signal.network} cellular`],
                ['Power', 'solar + 12 VDC battery'],
                ['Pump', 'not at this location'],
              ].map(([k, v], i) => (
                <g key={k}>
                  <text x={612} y={top + 40 + i * 18} fontSize="8.5" fill={MUTED}>
                    {k}
                  </text>
                  <text x={788} y={top + 40 + i * 18} fontSize="8.5" fontWeight="600" textAnchor="end" fill={INK}>
                    {v}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* ── solar → regulator → battery → PWR ────────────────────── */}
          <Box x={30} y={powerY - 18} w={130} h={40} title="Solar panel 400 W" sub={`${fmtValue(cc.pvW, 0)} W now`} />
          <Box
            x={196}
            y={powerY - 18}
            w={150}
            h={40}
            title="Charge regulator (MPPT)"
            sub={cc.flags.some((f) => f.active) ? cc.flags.filter((f) => f.active).map((f) => f.label).join(', ') : 'no fault flags'}
            dot={cc.flags.some((f) => f.active) ? DOT.warning : DOT.normal}
          />
          <Box x={382} y={powerY - 18} w={138} h={40} title="Battery 12 VDC LiFePO₄" sub={`${cc.socPct}% · ${fmtValue(cc.batteryV, 2)} V · ${cc.netA > 0 ? '+' : ''}${fmtValue(cc.netA, 1)} A`} />
          <line x1={160} x2={196} y1={powerY + 2} y2={powerY + 2} stroke={WIRE.power.stroke} strokeWidth={2} />
          <line x1={346} x2={382} y1={powerY + 2} y2={powerY + 2} stroke={WIRE.power.stroke} strokeWidth={2} />
          <line x1={440} x2={440} y1={powerY - 18} y2={logBottom} stroke={WIRE.power.stroke} strokeWidth={2} />
          <line x1={464} x2={464} y1={powerY - 18} y2={logBottom} stroke={WIRE.zero.stroke} strokeDasharray={WIRE.zero.dash} strokeWidth={1.2} />
          <text x={436} y={logBottom + 16} fontSize="8" textAnchor="end" fill={INK} {...HALO}>
            +12 V
          </text>
          <text x={468} y={logBottom + 16} fontSize="8" fill={MUTED} {...HALO}>
            0 V
          </text>
          <text x={452} y={logBottom - 4} fontSize="8.5" fontWeight="600" textAnchor="middle" fill={INK}>
            PWR
          </text>
          {/* earth */}
          <path d={`M 451,${powerY + 22} v 10 M 443,${powerY + 32} h 16 M 446,${powerY + 36} h 10 M 449,${powerY + 40} h 4`} stroke={MUTED} strokeWidth={1} />

        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-label="Wiring legend">
        {(['signal', 'serial', 'relay', 'power', 'zero', 'cell'] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke={WIRE[k].stroke} strokeDasharray={WIRE[k].dash} strokeWidth={WIRE[k].width} />
            </svg>
            {WIRE[k].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="font-semibold text-sev-alert-strong" aria-hidden>
            ✕
          </span>
          no response on that connection
        </li>
      </ul>
      <figcaption className="text-[11px] text-muted-foreground">
        After the client&apos;s Figure 3 and §6.1, for this location only. Hover a wire for its terminal, interface, cable
        and cores (§4.3). Each sensor is powered at 12 VDC from the station supply; signal and power share one cable.
      </figcaption>
    </figure>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  dot,
  tone,
  dashed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  dot?: string;
  tone?: 'primary';
  dashed?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={5}
        fill={tone === 'primary' ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))'}
        stroke={tone === 'primary' ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      {dot ? <circle cx={x + 10} cy={y + 14} r={3.5} fill={dot} /> : null}
      <text x={x + (dot ? 18 : 10)} y={y + 17} fontSize="9" fontWeight="700" fill={INK}>
        {title}
      </text>
      {sub ? (
        <text x={x + (dot ? 18 : 10)} y={y + 31} fontSize="8.5" fill={MUTED} className="tabular">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function capabilities(station: StationLocation): string {
  const has = (p: string) => station.sensors.some((s) => s.parameter === p);
  return [has('rainfall') && 'Rain', has('water_level') && 'Flood', has('temperature') && 'Temp', has('wind_mean') && 'Wind']
    .filter(Boolean)
    .join(' · ');
}
