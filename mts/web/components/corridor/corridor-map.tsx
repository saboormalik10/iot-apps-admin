'use client';

import Link from 'next/link';
import { Camera } from 'lucide-react';
import type { StationLive } from '@/lib/api/types';
import { fmtInt, fmtRelative, fmtSigned, fmtValue } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusDot, stationTone } from '@/components/status/status-pill';
import { useState } from 'react';
import type { AlertEvent } from '@/lib/api/types';
import { acknowledgeEvent, cameraEvents, maintenanceNow } from '@/lib/api/endpoints';
import { PtzDialog } from '@/features/alerts/ptz-dialog';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { Wrench } from 'lucide-react';

/**
 * The corridor, drawn as a schematic.
 *
 * The client's Figure 6 draws a stylised route, not a basemap — and on a corridor
 * where five locations sit within eight kilometres and two are twenty away, that is
 * the right call: a true projection would clump the south-west group into a smudge.
 * So the line is a hand-authored spine and every station is placed from its own
 * `map.x/y`, which means adding a location to the fixtures puts it on the map with
 * no drawing.
 *
 * The two corridors are drawn as two bands with a clear lane for the reading cards
 * — each card sits directly over (or under) its own pin, so no card can cover
 * another station, and none can fall off the top of the frame. Every pin also
 * carries its number, which is what makes the map readable on a phone, where the
 * cards move into the list below.
 *
 * The SVG carries *only* the two lines, stretched to the frame. Everything that
 * has to stay legible — the pins, their numbers, the region labels and the reading
 * cards — is HTML positioned from the same percentages on top of it.
 *
 * That split is deliberate. With the pins inside the SVG, a square viewBox letter-
 * boxed inside a 2:1 frame meant a pin at x=75 drew three hundred pixels from the
 * card at left:75%, and no amount of nudging the fixtures could fix it: one layer
 * was measuring the height and the other the width. Stretching the paths alone
 * costs nothing — a bezier does not mind being wider than it is tall — and lets
 * both layers share one coordinate system.
 *
 * Status is never colour alone — each pin carries a shape as well — because this
 * screen gets printed in black and white into a proposal, and read by people who
 * cannot tell amber from green.
 */

const VB_W = 100;
const VB_H = 100;

/** The north-west branch across the top, the south-west corridor along the foot. */
const NORTHWEST = 'M 6,13 C 22,8 40,6 60,8 C 74,9 84,11 95,14';
const SOUTHWEST = 'M 4,94 C 18,91 30,90 44,87 C 58,84 72,81 96,76';

export function CorridorMap({ stations, className }: { stations: StationLive[]; className?: string }) {
  const online = stations.filter((s) => s.status !== 'offline').length;
  const [ptz, setPtz] = useState<AlertEvent | null>(null);
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border bg-muted/40', className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        role="presentation"
      >
        {/* The north-west branch is drawn dotted, as the client's figure does. */}
        <path
          d={NORTHWEST}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1"
          strokeDasharray="1.6 1.6"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path d={SOUTHWEST} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.1" strokeLinecap="round" />

            </svg>

      <p className="absolute left-3 top-2 hidden text-[11px] uppercase tracking-wide text-muted-foreground sm:block">
        Northwest locations
      </p>
      <p className="absolute bottom-2 left-3 hidden text-[11px] uppercase tracking-wide text-muted-foreground sm:block">
        Southwest corridor — Marrickville to Belmore
      </p>

      {/* The pins. Every one carries its number at every width, which is what makes
          the schematic readable on a phone, where the cards move to the list. */}
      {stations.map((s) => (
        <div key={s.location.id} className="contents">
          <StationPin station={s} />
          {/* §7.5: the affected station is flagged with a small red blinking
              camera the moment its threshold is reached — and clicking it opens
              the live PTZ feed for that location. */}
          {s.cameraVerification ? (
            <button
              onClick={() => setPtz(cameraEvents().filter((e) => e.locationId === s.location.id).sort((a, b) => b.t - a.t)[0] ?? null)}
              className="absolute z-10 flex h-6 w-6 -translate-y-1/2 translate-x-3 items-center justify-center rounded-full bg-card shadow ring-1 ring-sev-alert/40 hover:bg-sev-alert-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${s.location.map.x}%`, top: `${s.location.map.y}%` }}
              aria-label={`Open the PTZ camera at ${s.location.name}`}
              title="Standing water — check the PTZ camera"
            >
              <Camera className="h-3.5 w-3.5 animate-blink-alert text-sev-alert" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}

      {/* Reading cards, positioned from the same percentages. Below `xl` there is
          not room for seven of them without overlap, so the map keeps the numbered
          pins and the cards become the list underneath. */}
      <div className="pointer-events-none absolute inset-0 hidden xl:block">
        {stations.map((s) => (
          <StationCard key={s.location.id} station={s} />
        ))}
      </div>

      <Legend online={online} total={stations.length} />
      <PtzDialog event={ptz} onClose={() => setPtz(null)} onAcknowledge={(id) => acknowledgeEvent(id)} />
    </div>
  );
}

const TONE_RING: Record<string, string> = {
  alert: 'border-sev-alert text-sev-alert-strong',
  warning: 'border-sev-warning text-sev-warning-strong',
  offline: 'border-sev-offline text-sev-offline-strong',
  normal: 'border-sev-normal text-sev-normal-strong',
};

function StationPin({ station }: { station: StationLive }) {
  const tone = stationTone(station.status);
  const { x, y, labelSide } = station.location.map;
  return (
    <Link
      href={`/stations/${station.location.id}`}
      title={station.location.name}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="sr-only">{station.location.name}</span>
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card text-xs font-bold shadow-sm',
          TONE_RING[tone],
        )}
        aria-hidden
      >
        {station.location.ordinal}
      </span>
      {/* Shape, not just hue: an alert carries a triangle a colour-blind reader
          (or a monochrome printout) can still see. */}
      {tone === 'alert' ? (
        <span className="absolute -left-2.5 -top-1 text-[11px] leading-none text-sev-alert" aria-hidden>
          ▲
        </span>
      ) : null}
      {tone === 'offline' ? (
        <span className="absolute -left-2.5 -top-1 text-[11px] leading-none text-sev-offline" aria-hidden>
          ⊘
        </span>
      ) : null}
      {/* A stem pointing at this station's card, so pin and reading read as one. */}
      <span
        className={cn('absolute left-1/2 hidden w-px -translate-x-1/2 bg-border xl:block', labelSide === 'above' ? 'bottom-7 h-4' : 'top-7 h-4')}
        aria-hidden
      />
    </Link>
  );
}

function StationCard({ station }: { station: StationLive }) {
  const { x, y, labelSide } = station.location.map;
  const tone = stationTone(station.status);
  /* The order the client's Figure 6 lists them in, and never more than four —
     a card that grows past that stops being glanceable. */
  const ORDER = ['rainfall', 'water_level', 'temperature', 'wind_mean', 'float_switch'];
  const shown = station.readings
    .filter((r) => ORDER.includes(r.parameter))
    .sort((a, b) => ORDER.indexOf(a.parameter) - ORDER.indexOf(b.parameter))
    .slice(0, 4);

  return (
    <div
      className="pointer-events-auto absolute w-[168px]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, ${labelSide === 'above' ? 'calc(-100% - 22px)' : '22px'})`,
      }}
    >
      <Link
        href={`/stations/${station.location.id}`}
        className="block rounded-md border bg-card/95 p-2 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="mb-1 flex items-start justify-between gap-1">
          {/* Wrapping, not truncating: "Marrickville–Dulwich Hill" was an ellipsis
              on every screen, and a location you cannot name is not on the map. */}
          <span className="text-xs font-semibold leading-tight">
            <span className="text-muted-foreground">{station.location.ordinal}.</span> {station.location.name}
          </span>
          <span className="mt-0.5 flex shrink-0 items-center gap-1">
            {maintenanceNow(station.location.id).on ? (
              <Wrench className="h-3 w-3 text-sev-warning-strong" aria-label="In maintenance mode" />
            ) : null}
            {station.cameraVerification ? (
              <Camera className="h-3 w-3 animate-blink-alert text-sev-alert" aria-label="Camera verification requested" />
            ) : null}
            <StatusDot tone={tone} />
          </span>
        </div>
        <dl className="space-y-0.5">
          {shown.map((r) => (
            <div key={r.sensorId + r.parameter} className="flex items-baseline justify-between gap-2 text-[11px]">
              <dt className="truncate text-muted-foreground">
                {shortLabel(r.parameter)}
                {r.sensorId.includes('-UP-') ? ' up' : r.sensorId.includes('-DN-') ? ' down' : ''}
              </dt>
              <dd
                className={cn(
                  'tabular font-medium',
                  r.status === 'alert' && 'text-sev-alert-strong',
                  r.status === 'warning' && 'text-sev-warning-strong',
                )}
              >
                {renderValue(r.parameter, r.value)}
                {/* Figure 6: each reading is shown against its line. */}
                {LINE[r.parameter] !== undefined ? (
                  <span className="font-normal text-muted-foreground"> /{LINE[r.parameter]}</span>
                ) : null}
                <span className="ml-0.5 font-normal text-muted-foreground">{r.unit}</span>
                {r.status === 'alert' ? ' ▲' : ''}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          batt {station.location.loggers[0].batteryPct}% · {station.location.loggers[0].signal.network}{' '}
          {station.location.loggers[0].signal.rssiDbm} · {fmtRelative(station.updatedAt, station.updatedAt + 30_000)}
        </p>
      </Link>
    </div>
  );
}

function Legend({ online, total }: { online: number; total: number }) {
  return (
    <div className="absolute right-3 top-3 hidden rounded-md border bg-card/95 p-3 text-[11px] shadow-sm backdrop-blur-sm xl:block">
      <p className="font-semibold">Legend</p>
      <p className="mb-1.5 text-muted-foreground">
        {online}/{total} locations reporting · refresh 10 min
      </p>
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <StatusDot tone="normal" /> Normal — within thresholds
        </li>
        <li className="flex items-center gap-2">
          <StatusDot tone="warning" /> Approaching threshold
        </li>
        <li className="flex items-center gap-2">
          <StatusDot tone="alert" /> Alert active
        </li>
        <li className="flex items-center gap-2">
          <StatusDot tone="offline" /> Sensor offline
        </li>
        <li className="flex items-center gap-2 pt-1">
          <Camera className="h-3 w-3 text-sev-alert" /> red camera — check PTZ feed
        </li>
      </ul>
      <p className="mt-2 border-t pt-1.5 text-muted-foreground">
        Readings shown as value /threshold
        <br />
        Rain mm/hr · Wind km/h · Temp °C · Level mm
      </p>
      <p className="mt-2 flex items-center gap-1.5 border-t pt-1.5 text-muted-foreground">
        <Wrench className="h-3 w-3 text-sev-warning-strong" aria-hidden /> maintenance mode
      </p>
    </div>
  );
}

/** The line each card reading is judged against — the same numbers the rules use. */
const LINE: Record<string, number> = {
  rainfall: THRESHOLDS.rainfall.intensity.value,
  water_level: THRESHOLDS.flood.standingWaterMm,
  temperature: THRESHOLDS.temperature.heat1.value,
  wind_mean: THRESHOLDS.wind.gustWarn.value,
};

function shortLabel(parameter: string): string {
  switch (parameter) {
    case 'rainfall':
      return 'Rain';
    case 'water_level':
      // "Level", so "Level down +18 /80 mm" fits the card width.
      return 'Level';
    case 'temperature':
      return 'Temp';
    case 'wind_mean':
      return 'Wind';
    case 'float_switch':
      return 'Float';
    default:
      return parameter;
  }
}

function renderValue(parameter: string, value: number | null): string {
  if (value === null) return '–';
  if (parameter === 'water_level') return fmtSigned(value);
  if (parameter === 'float_switch') return value === 1 ? 'WET' : 'DRY';
  if (parameter === 'temperature') return fmtValue(value, 1);
  return fmtInt(value);
}
