'use client';

import type { LiveReading, Pump, StationLocation } from '@/lib/api/types';
import { chargeController, compass } from '@/lib/api/endpoints';
import { fmtSigned, fmtValue } from '@/lib/format';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';

/**
 * The station as installed (§6.2, Figure 2), with the live values on it.
 *
 * The proposal draws each station in elevation: the VM5F telescopic mast with
 * the WindSonic at about 10 m and the GMX300 and rain gauge at 1.5–2 m, the 2.5 m
 * aluminium mast carrying the radar over the channel with the float switch and
 * staff gauge, the IP66 cabinet at about 1.3 m, the north-facing panel — and at
 * Marrickville the existing wet well and its panel. A technician arriving on
 * site, or a controller wondering why the float and the radar disagree, wants
 * exactly that picture: where each reading comes from, and the water drawn
 * against the rail it threatens.
 *
 * Heights follow the proposal. The mast is broken between 3 m and 9.5 m, and
 * the flood detail is drawn about five times larger than the rest, so a few
 * centimetres of water are visible — both are marked. Not to scale, as the
 * client's own elevations say.
 */

const G = 250; // ground line
const K = 48; // px per metre, near the ground
const BREAK_LO = 3;
const BREAK_HI = 9.5;
const GAP = 18;
const y = (m: number) => (m <= BREAK_LO ? G - m * K : G - BREAK_LO * K - GAP - (m - BREAK_HI) * K);

/* The flood detail: datum at the channel invert, rail foot at the ground line. */
const F = THRESHOLDS.flood;
const DATUM = G + 80;
const MM = (DATUM - G) / F.railFootMm;
const yl = (mm: number) => DATUM - mm * MM;

const INK = 'hsl(var(--foreground))';
const MUTED = 'hsl(var(--muted-foreground))';
const LINE = 'hsl(var(--border))';
const STEEL = 'hsl(var(--muted-foreground) / 0.55)';
const WATER = 'hsl(var(--chart-1))';
/* A ring of card colour round every label, so a guy rope or a beam behind it never strikes it through. */
const HALO = { paintOrder: 'stroke' as const, stroke: 'hsl(var(--card))', strokeWidth: 3, strokeLinejoin: 'round' as const };

export function SiteElevation({
  station,
  readings,
  pumps,
}: {
  station: StationLocation;
  readings: LiveReading[];
  pumps?: Pump[];
}) {
  const read = (p: string, sensor?: string) =>
    readings.find((r) => r.parameter === p && (!sensor || r.sensorId.includes(sensor)))?.value ?? null;
  const has = (p: string) => station.sensors.some((s) => s.parameter === p);
  const tall = has('wind_gust');
  const flood = has('water_level');
  const tunnel = station.loggers.length > 1;
  const top = tall ? -14 : 70;
  const height = (flood ? DATUM + 26 : G + 26) - top;
  /* The tunnel has two complete units side by side, so it gets a wider sheet. */
  const W = tunnel ? 800 : 640;

  /* Where things go: the VM5F on the left when there is one, the flood units to its right. */
  const mastX = 150;
  const units = flood
    ? tunnel
      ? [
          { x: 230, label: 'Up tunnel', sensor: '-UP-', logger: station.loggers[0].id },
          { x: 600, label: 'Down tunnel', sensor: '-DN-', logger: station.loggers[1].id },
        ]
      : [{ x: tall ? 380 : 250, label: undefined, sensor: undefined, logger: station.loggers[0].id }]
    : [];
  const pumpWell = station.pumpStation ? { x: 430 } : undefined;

  return (
    <figure className="min-w-0">
      <div className="scroll-x-hint overflow-x-auto">
        <svg
          viewBox={`0 ${top} ${W} ${height}`}
          className="block w-full min-w-[580px] rounded-md border bg-muted/30"
          role="img"
          aria-label={`${station.name} — site elevation with live readings`}
        >
          {/* sky / ground */}
          <rect x="0" y={G} width={W} height={height + top - G} fill="hsl(var(--muted))" />
          <line x1="0" x2={W} y1={G} y2={G} stroke={MUTED} strokeWidth="1.2" />
          <text x="40" y={G + 11} fontSize="8" fill={MUTED}>
            ground / formation
          </text>

          {/* height axis */}
          {[0, 1, 2, 3, ...(tall ? [10, 11] : [])].map((m) => (
            <g key={m}>
              <line x1="30" x2="36" y1={y(m)} y2={y(m)} stroke={MUTED} />
              <text x="27" y={y(m) + 3} fontSize="8" textAnchor="end" fill={MUTED} className="tabular">
                {m} m
              </text>
            </g>
          ))}
          <line x1="33" x2="33" y1={y(tall ? 11 : 3)} y2={G} stroke={LINE} />
          {tall ? <Squiggle x={33} y={y(BREAK_LO) - GAP / 2} /> : null}

          {/* On a VM5F site the cabinet and panel ride on the VM5F (§5.7). */}
          {tall ? <WindMast x={mastX} station={station} read={read} withRain={has('rainfall')} logger={station.loggers[0].id} /> : null}

          {units.map((u, i) => (
            <FloodUnit
              key={u.x}
              x={u.x}
              label={u.label}
              level={read('water_level', u.sensor)}
              floatWet={(read('float_switch', u.sensor) ?? 0) === 1}
              logger={u.logger}
              /* Flood-only sites carry their own cabinet and panel on the 2.5 m mast (§5.7). */
              ownPower={!tall || tunnel}
              rain={!tall && i === 0 && has('rainfall') ? read('rainfall') : undefined}
              pumpWell={pumpWell}
            />
          ))}

          {pumpWell ? <PumpWell x={pumpWell.x} level={read('water_level')} pumps={pumps} /> : null}

          {!flood ? (
            /* Windsor Road: a single-span crossing, wind and temperature only. */
            <g>
              <path d={`M 330,${G - 30} L 610,${G - 30}`} stroke={STEEL} strokeWidth="6" />
              <path d={`M 340,${G - 27} L 340,${G} M 600,${G - 27} L 600,${G}`} stroke={STEEL} strokeWidth="4" />
              <text x="470" y={G - 38} fontSize="8.5" fontWeight="600" textAnchor="middle" fill={INK} {...HALO}>
                single-span crossing
              </text>
              <text x="470" y={y(2.6)} fontSize="8" textAnchor="middle" fill={MUTED} {...HALO}>
                No water-level point here — wind and temperature only (§6.1).
              </text>
              <text x="470" y={y(2.6) + 11} fontSize="8" textAnchor="middle" fill={MUTED} {...HALO}>
                Siting allows for wind channelling and local acceleration over the bridge (§5.4).
              </text>
            </g>
          ) : null}

          {flood ? (
            <text x={W - 6} y={top + 12} fontSize="7.5" textAnchor="end" fill={MUTED}>
              flood detail drawn ×5 · mm above datum
            </text>
          ) : null}
        </svg>
      </div>
      <figcaption className="mt-1.5 text-[11px] text-muted-foreground">
        Indicative elevation, not to scale (§6.2). Heights as proposed: wind at ~10 m on the VM5F (lowered to 2.74 m for
        servicing), temperature/RH and rain at 1.5–2 m, cabinet at ~1.3 m, radar and float on a 2.5 m aluminium mast.
        Live values from the latest readings.
      </figcaption>
    </figure>
  );
}

function Squiggle({ x, y: cy }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 6} y={cy - 6} width="12" height="12" fill="hsl(var(--background))" />
      <path d={`M ${x - 6},${cy - 2} l 4,-3 l 4,6 l 4,-3 M ${x - 6},${cy + 3} l 4,-3 l 4,6 l 4,-3`} stroke={MUTED} fill="none" strokeWidth="0.9" />
    </g>
  );
}

function Label({ x, y: ty, title, value, anchor = 'start' }: { x: number; y: number; title: string; value?: string; anchor?: 'start' | 'end' | 'middle' }) {
  return (
    <g>
      <text x={x} y={ty} fontSize="8.5" fontWeight="600" fill={INK} textAnchor={anchor} {...HALO}>
        {title}
      </text>
      {value ? (
        <text x={x} y={ty + 10} fontSize="8.5" fill={MUTED} textAnchor={anchor} className="tabular" {...HALO}>
          {value}
        </text>
      ) : null}
    </g>
  );
}

function SolarPanel({ x, y: py, logger, side = 'right' }: { x: number; y: number; logger: string; side?: 'left' | 'right' }) {
  const cc = chargeController(logger);
  const flagged = cc.flags.some((f) => f.active);
  return (
    <g>
      <path d={`M ${x},${py} l 34,-12 l 6,14 l -34,12 z`} fill="hsl(var(--primary) / 0.75)" stroke="hsl(var(--primary))" />
      <path d={`M ${x + 11},${py - 4} l 6,14 M ${x + 23},${py - 8} l 6,14`} stroke="hsl(var(--primary-foreground) / 0.5)" strokeWidth="0.7" />
      <Label
        x={side === 'right' ? x + 46 : x - 6}
        y={py - 8}
        anchor={side === 'right' ? 'start' : 'end'}
        title="400 W panel (N)"
        value={`${fmtValue(cc.pvW, 0)} W${flagged ? ' · under-yield' : ''}`}
      />
    </g>
  );
}

function Cabinet({ x, y: cy, logger, side = 'left' }: { x: number; y: number; logger: string; side?: 'left' | 'right' }) {
  const cc = chargeController(logger);
  const bx = side === 'left' ? x - 30 : x + 4;
  return (
    <g>
      <rect x={bx} y={cy - 14} width="26" height="28" rx="2" fill="hsl(var(--card))" stroke={INK} strokeWidth="1" />
      <rect x={bx + 4} y={cy - 9} width="18" height="7" rx="1" fill="hsl(var(--primary) / 0.2)" />
      <rect x={bx + 4} y={cy + 3} width="18" height="6" rx="1" fill={cc.socPct <= THRESHOLDS.power.lowBatteryPct ? 'hsl(var(--sev-warning))' : 'hsl(var(--sev-normal) / 0.7)'} />
      <Label
        x={side === 'left' ? bx - 4 : bx + 30}
        y={cy - 4}
        anchor={side === 'left' ? 'end' : 'start'}
        title={`OMC-048 · ${logger}`}
        value={`IP66 · battery ${cc.socPct}% · ${fmtValue(cc.batteryV, 1)} V`}
      />
    </g>
  );
}

function WindMast({
  x,
  station,
  read,
  withRain,
  logger,
}: {
  x: number;
  station: StationLocation;
  read: (p: string, s?: string) => number | null;
  withRain: boolean;
  logger: string;
}) {
  const gust = read('wind_gust');
  const mean = read('wind_mean');
  const dir = read('wind_dir');
  const temp = read('temperature');
  const rh = read('humidity');
  return (
    <g>
      {/* guys */}
      <line x1={x} y1={y(10.4)} x2={x - 62} y2={G} stroke={STEEL} strokeDasharray="3 3" strokeWidth="0.8" />
      <line x1={x} y1={y(10.4)} x2={x + 62} y2={G} stroke={STEEL} strokeDasharray="3 3" strokeWidth="0.8" />
      {/* the VM5F, broken between 3 m and 9.5 m */}
      <rect x={x - 3.5} y={y(BREAK_LO) - 2} width="7" height={G - y(BREAK_LO) + 2} fill={STEEL} />
      <rect x={x - 2.5} y={y(11.3)} width="5" height={y(BREAK_HI) - y(11.3) + 2} fill={STEEL} />
      <Squiggle x={x} y={y(BREAK_LO) - GAP / 2} />
      <line x1={x} x2={x} y1={y(11.3)} y2={y(11.3) - 8} stroke={INK} strokeWidth="1" />
      <text x={x + 4} y={y(11.3) - 2} fontSize="7" fill={MUTED}>
        air terminal
      </text>
      <rect x={x - 14} y={G} width="28" height="5" fill={STEEL} />
      <text x={x} y={G + 15} fontSize="7.5" textAnchor="middle" fill={MUTED}>
        VM5F mast · 11.3 m
      </text>

      {/* WindSonic 75 at ~10 m */}
      <line x1={x} x2={x + 16} y1={y(10)} y2={y(10)} stroke={INK} />
      <circle cx={x + 20} cy={y(10)} r="5" fill="hsl(var(--card))" stroke={INK} />
      <circle cx={x + 20} cy={y(10)} r="1.5" fill={INK} />
      <Label
        x={x + 30}
        y={y(10) - 2}
        title="WindSonic 75 · 10 m"
        value={gust === null ? 'no data' : `gust ${fmtValue(gust, 0)} · mean ${fmtValue(mean, 0)} km/h${dir !== null ? ` · ${compass(dir)}` : ''}`}
      />

      {/* GMX300 at 1.5–2 m */}
      {temp !== null || station.sensors.some((s) => s.parameter === 'temperature') ? (
        <g>
          <line x1={x} x2={x + 16} y1={y(1.75)} y2={y(1.75)} stroke={INK} />
          {[0, 3, 6, 9].map((d) => (
            <rect key={d} x={x + 13} y={y(1.75) - 6 + d} width="13" height="2" rx="1" fill={INK} opacity="0.75" />
          ))}
          <Label x={x + 32} y={y(1.75) - 2} title="GMX300 · 1.75 m" value={`${fmtValue(temp)} °C · ${fmtValue(rh, 0)} %RH`} />
        </g>
      ) : null}

      {/* RIMCO 7499 at ~1.6 m, on its own arm */}
      {withRain ? (
        <g>
          <line x1={x} x2={x - 14} y1={y(1.5)} y2={y(1.5)} stroke={INK} />
          <path d={`M ${x - 26},${y(1.5) - 12} h 18 l -5,9 h -8 z`} fill="hsl(var(--card))" stroke={INK} />
          <Label x={x - 30} y={y(1.5) - 22} anchor="end" title="RIMCO 7499" value={`${fmtValue(read('rainfall'))} mm / 1 h`} />
        </g>
      ) : null}

      <Cabinet x={x} y={y(1.0)} logger={logger} side="right" />
      <SolarPanel x={x + 6} y={y(2.75)} logger={logger} />
    </g>
  );
}

function FloodUnit({
  x,
  label,
  level,
  floatWet,
  logger,
  ownPower,
  rain,
  pumpWell,
}: {
  x: number;
  label?: string;
  level: number | null;
  floatWet: boolean;
  logger: string;
  ownPower: boolean;
  rain?: number | null;
  pumpWell?: { x: number };
}) {
  const mast = x;
  const chL = x + 26;
  const chR = x + 126;
  const radarX = (chL + chR) / 2;
  const surface = level === null ? null : Math.max(G - 14, yl(Math.max(0, level)));
  const over = level !== null && level >= F.railFootMm;
  const ticks = [
    { mm: F.railFootMm, text: `rail foot +${F.railFootMm}`, strong: true },
    { mm: F.highHighMm },
    { mm: F.pumpStartMm, text: `pump start +${F.pumpStartMm}` },
    { mm: F.standingWaterMm },
    { mm: F.pumpStopMm },
  ];
  const floatY = yl(F.pumpStartMm - 5);

  return (
    <g>
      {label ? (
        <text x={radarX} y={y(3) - 4} fontSize="9" fontWeight="700" textAnchor="middle" fill={INK}>
          {label}
        </text>
      ) : null}

      {/* the channel, cut below the formation */}
      <path d={`M ${chL - 6},${G} L ${chL},${DATUM} L ${chR},${DATUM} L ${chR + 6},${G}`} fill="hsl(var(--background))" stroke={MUTED} />
      {surface !== null ? (
        <path
          d={`M ${chL - 6 + ((DATUM - surface) / (DATUM - G)) * 0},${Math.min(surface, DATUM)} L ${chR + 6},${Math.min(surface, DATUM)} L ${chR},${DATUM} L ${chL},${DATUM} Z`}
          fill={WATER}
          fillOpacity="0.45"
        />
      ) : null}
      {/* water over the formation, when it is */}
      {surface !== null && surface < G ? (
        <rect x={chL - 30} y={surface} width={chR - chL + 66} height={G - surface} fill={WATER} fillOpacity="0.35" />
      ) : null}
      {surface !== null ? (
        <line x1={chL - 6} x2={chR + 6} y1={surface} y2={surface} stroke={WATER} strokeWidth="1.5" />
      ) : null}

      {/* the running rail on the formation beside the channel: its foot is the block-the-line level */}
      <g transform={`translate(${chR + 18}, ${G})`}>
        <rect x="-7" y="-2" width="14" height="2" fill={INK} />
        <rect x="-1.5" y="-10" width="3" height="8" fill={INK} />
        <rect x="-4" y="-13" width="8" height="3" rx="1" fill={INK} />
      </g>
      <text x={chR + 28} y={G - 4} fontSize="7.5" fill={over ? 'hsl(var(--sev-alert-strong))' : MUTED} fontWeight={over ? 700 : 400}>
        {over ? 'water over rail foot' : 'rail'}
      </text>

      {/* staff gauge with the set points */}
      <rect x={chL + 3} y={yl(F.railFootMm + 20)} width="5" height={DATUM - yl(F.railFootMm + 20)} fill="hsl(var(--card))" stroke={INK} strokeWidth="0.7" />
      {ticks.map((t) => (
        <g key={t.mm}>
          <line
            x1={chL + 3}
            x2={chR - 2}
            y1={yl(t.mm)}
            y2={yl(t.mm)}
            stroke={t.strong ? 'hsl(var(--threshold))' : 'hsl(var(--threshold-soft))'}
            strokeDasharray="3 2"
            strokeWidth="0.8"
          >
            <title>+{t.mm} mm</title>
          </line>
          {t.text ? (
            <text x={chL - 12} y={yl(t.mm) + 3} fontSize="7" textAnchor="end" fill={MUTED} className="tabular" {...HALO}>
              {t.text}
            </text>
          ) : null}
        </g>
      ))}

      {/* float switch at its trip height */}
      <line x1={chR - 2} x2={chR - 12} y1={floatY} y2={floatY} stroke={INK} strokeWidth="0.8" />
      <circle cx={chR - 15} cy={floatY} r="3.5" fill={floatWet ? WATER : 'hsl(var(--card))'} stroke={INK} strokeWidth="0.8" />

      {/* the 2.5 m aluminium mast, cross-arm at 2.2 m, radar looking down */}
      <rect x={mast - 2} y={y(2.5)} width="4" height={G - y(2.5)} fill={STEEL} />
      <line x1={mast} x2={radarX} y1={y(2.2)} y2={y(2.2)} stroke={STEEL} strokeWidth="2.5" />
      <rect x={radarX - 6} y={y(2.2)} width="12" height="10" rx="2" fill="hsl(var(--primary))" />
      {surface !== null ? (
        <path
          d={`M ${radarX - 4},${y(2.2) + 10} L ${radarX - 14},${surface} L ${radarX + 14},${surface} L ${radarX + 4},${y(2.2) + 10} Z`}
          fill="hsl(var(--primary) / 0.12)"
          stroke="hsl(var(--primary) / 0.5)"
          strokeDasharray="2 2"
          strokeWidth="0.6"
        />
      ) : (
        <text x={radarX} y={y(1.4)} fontSize="8" textAnchor="middle" fill="hsl(var(--sev-warning-strong))" fontWeight="600">
          radar not reporting
        </text>
      )}
      <Label
        x={radarX + 12}
        y={y(2.2) - 12}
        title="YGRD-65-D radar"
        value={level === null ? 'no reading' : `${fmtSigned(level)} mm · float ${floatWet ? 'WET' : 'dry'}`}
      />

      {ownPower ? (
        <>
          <Cabinet x={mast} y={y(1.3)} logger={logger} />
          <SolarPanel x={mast - 40} y={y(2.55)} logger={logger} side="left" />
        </>
      ) : null}
      {rain !== undefined ? (
        <g>
          <line x1={mast} x2={mast - 14} y1={y(2.0)} y2={y(2.0)} stroke={INK} />
          <path d={`M ${mast - 26},${y(2.0) - 12} h 18 l -5,9 h -8 z`} fill="hsl(var(--card))" stroke={INK} />
          <Label x={mast - 30} y={y(2.0) + 1} anchor="end" title="RIMCO 7499" value={`${fmtValue(rain)} mm / 1 h`} />
        </g>
      ) : null}

      {/* the channel feeds the wet well */}
      {pumpWell ? <line x1={chR} x2={pumpWell.x + 4} y1={DATUM - 6} y2={DATUM - 6} stroke={WATER} strokeWidth="3" strokeOpacity="0.6" /> : null}
    </g>
  );
}

function PumpWell({ x, level, pumps }: { x: number; level: number | null; pumps?: Pump[] }) {
  const w = 120;
  const bottom = DATUM + 14;
  const surface = level === null ? null : Math.max(G + 4, yl(Math.max(0, level)));
  return (
    <g>
      <rect x={x} y={G} width={w} height={bottom - G} fill="hsl(var(--background))" stroke={MUTED} />
      {surface !== null ? <rect x={x + 1} y={surface} width={w - 2} height={bottom - surface - 1} fill={WATER} fillOpacity="0.45" /> : null}
      {(pumps ?? []).slice(0, 2).map((p, i) => {
        const cx = x + 30 + i * 56;
        const on = p.state === 'running';
        return (
          <g key={p.id}>
            <rect x={cx - 9} y={bottom - 26} width="18" height="22" rx="4" fill={on ? 'hsl(var(--op-running))' : 'hsl(var(--op-ready))'} stroke={INK} strokeWidth="0.6" />
            <line x1={cx} x2={cx} y1={bottom - 26} y2={G - 18} stroke={STEEL} strokeWidth="2" />
            <text x={cx} y={bottom - 11} fontSize="7.5" fontWeight="700" textAnchor="middle" fill="hsl(var(--card))">
              P{i + 1}
            </text>
            <text x={cx} y={G - 22} fontSize="7.5" textAnchor="middle" fill={INK} fontWeight="600">
              {p.role === 'duty' ? 'duty' : 'standby'} · {on ? 'RUN' : p.state}
            </text>
          </g>
        );
      })}
      <line x1={x + 30} x2={x + w + 40} y1={G - 18} y2={G - 18} stroke={STEEL} strokeWidth="2" />
      <text x={x + w + 40} y={G - 22} fontSize="7.5" textAnchor="end" fill={MUTED}>
        → outfall
      </text>
      {/* the existing control panel, wired to the OMC-048 */}
      <rect x={x + w - 2} y={y(1.6)} width="30" height="34" rx="2" fill="hsl(var(--card))" stroke="hsl(var(--sev-warning))" />
      <text x={x + w + 13} y={y(1.6) + 14} fontSize="7" textAnchor="middle" fill={INK} fontWeight="600">
        Pump
      </text>
      <text x={x + w + 13} y={y(1.6) + 23} fontSize="7" textAnchor="middle" fill={INK} fontWeight="600">
        panel
      </text>
      <line x1={x + w + 13} x2={x + w + 13} y1={y(1.6) + 34} y2={G} stroke={STEEL} strokeWidth="2" />
      <text x={x + w / 2} y={bottom + 10} fontSize="7.5" textAnchor="middle" fill={MUTED}>
        existing wet well · 1 duty + 1 standby
      </text>
    </g>
  );
}
