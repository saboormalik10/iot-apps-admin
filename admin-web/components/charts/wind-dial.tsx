import { COMPASS_16, fmt, sectorIndex } from './chart-utils';
import { BEAUFORT, WIND_SPEED_BANDS, beaufortFromMs, cssVar, windBandIndex } from '@/lib/api/scales';
import { cn } from '@/lib/utils';

/**
 * WindDial — one instrument showing what the wind is doing RIGHT NOW: a compass
 * ring with a direction needle and the speed as a hero number at its centre.
 *
 * WHY THIS EXISTS ALONGSIDE THE WIND ROSE
 * They answer different questions and neither substitutes for the other. The wind
 * rose is a statistical distribution — "what has the wind been doing over this
 * window". This is the live instantaneous reading — "what is it doing now". The
 * client asked specifically for the latter after we had built the former.
 *
 * FORM
 * Two dimensions of a single reading: magnitude (speed) and bearing (direction).
 * That is a hero number inside a compass, not a plot — so there is no axis, no
 * legend (one series), and no tooltip: the value a tooltip would reveal is
 * already printed in the middle.
 *
 * COLOUR
 * Speed is a MAGNITUDE job, so it takes the system's sequential wind bands
 * (`WIND_SPEED_BANDS`, seq-0..seq-5) rather than a categorical hue. The needle
 * keeps the fixed `chart-1` identity hue so it reads as the same family as
 * CompassTile. No status colours — this is a reading, not an alarm state.
 * Colour is never the only signal: the number, the unit, the sector label and the
 * Beaufort force are all printed.
 *
 * NULLS
 * A null speed or bearing renders an en-dash and no needle — never a fabricated
 * 0, which on a compass would read as a confident "due north". This matters:
 * 31% of the station's real readings are calm and carry no bearing at all.
 */
export function WindDial({
  speedMs,
  speedKmh,
  dirDeg,
  /**
   * Degrees added to the raw sensor bearing to reach true north. 0 means the mast
   * has not been surveyed, so the bearing is RELATIVE and the dial says so rather
   * than implying a true reading.
   */
  headingOffsetDeg = 0,
  label = 'Wind',
  size = 220,
  className,
}: {
  speedMs: number | null;
  speedKmh: number | null;
  dirDeg: number | null;
  headingOffsetDeg?: number;
  label?: string;
  size?: number;
  className?: string;
}) {
  const hasSpeed = speedMs != null && !Number.isNaN(speedMs);
  const hasDir = dirDeg != null && !Number.isNaN(dirDeg);
  const bearing = hasDir ? ((dirDeg! % 360) + 360) % 360 : null;
  const sector = bearing != null ? COMPASS_16[sectorIndex(bearing)] : '–';

  const band = hasSpeed ? WIND_SPEED_BANDS[windBandIndex(speedMs!)] : null;
  const force = hasSpeed ? beaufortFromMs(speedMs!) : null;
  const calibrated = headingOffsetDeg !== 0;

  const cx = size / 2;
  const cy = size / 2;
  const rRing = size / 2 - 10;
  const rTick = rRing - 7;

  const ariaLabel = hasSpeed
    ? `${label}: ${speedKmh?.toFixed(2) ?? '–'} kilometres per hour` +
      (bearing != null ? `, bearing ${Math.round(bearing)} degrees ${sector}` : ', no bearing — below the sensor threshold') +
      (calibrated ? '' : ', bearing relative to the mast, uncalibrated')
    : `${label}: no data`;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {/* `role="meter"` REQUIRES aria-valuenow (axe: aria-required-attr, CRITICAL).
          With no speed there is no value to report, so this is not a meter — it
          falls back to an image carrying the same accessible name. */}
      <div
        aria-label={ariaLabel}
        {...(hasSpeed
          ? {
              role: 'meter',
              'aria-valuenow': Number(speedKmh?.toFixed(2) ?? 0),
              'aria-valuemin': 0,
              'aria-valuemax': 120,
            }
          : { role: 'img' })}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation">
          {/* Compass ring — recessive, it is the frame not the data. */}
          <circle cx={cx} cy={cy} r={rRing} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />

          {/* 16 ticks; the four cardinals are longer and labelled. */}
          {Array.from({ length: 16 }, (_, i) => {
            const a = i * 22.5;
            const cardinal = a % 90 === 0;
            const rad = ((a - 90) * Math.PI) / 180;
            const inner = cardinal ? rTick - 5 : rTick;
            return (
              <line
                key={a}
                x1={cx + inner * Math.cos(rad)}
                y1={cy + inner * Math.sin(rad)}
                x2={cx + rRing * Math.cos(rad)}
                y2={cy + rRing * Math.sin(rad)}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={cardinal ? 2 : 1}
                opacity={cardinal ? 0.9 : 0.45}
              />
            );
          })}

          {/* Cardinal letters — text tokens, never the series colour.
              Positioned polar-wise INSIDE the tick band: laid out on the ring
              itself, each glyph had its own tick drawn straight through it. */}
          {[
            { t: 'N', a: 0 },
            { t: 'E', a: 90 },
            { t: 'S', a: 180 },
            { t: 'W', a: 270 },
          ].map((c) => {
            const rad = ((c.a - 90) * Math.PI) / 180;
            const rLabel = rTick - 15;
            return (
              <text
                key={c.t}
                x={cx + rLabel * Math.cos(rad)}
                y={cy + rLabel * Math.sin(rad)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill="hsl(var(--muted-foreground))"
              >
                {c.t}
              </text>
            );
          })}

          {/* Needle — omitted entirely when there is no bearing. */}
          {bearing != null ? (
            <g transform={`rotate(${bearing} ${cx} ${cy})`}>
              <line
                x1={cx}
                y1={cy + 14}
                x2={cx}
                y2={cy - rTick + 10}
                stroke={cssVar('chart-1')}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <polygon
                points={`${cx},${cy - rTick + 2} ${cx - 7},${cy - rTick + 16} ${cx + 7},${cy - rTick + 16}`}
                fill={cssVar('chart-1')}
              />
            </g>
          ) : null}

          {/* Hub, drawn over the needle so the pivot reads cleanly. */}
          <circle cx={cx} cy={cy} r={4} fill="hsl(var(--background))" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
        </svg>
      </div>

      {/* Hero number. Sits below the dial rather than inside it so the needle can
          sweep the full circle without ever crossing the text. */}
      <div className="-mt-2 flex flex-col items-center gap-1 text-center">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums leading-none">
            {hasSpeed ? speedKmh?.toFixed(2) : fmt(null)}
          </span>
          <span className="text-sm text-muted-foreground">km/h</span>
        </div>

        {/* Band + force only when there is a reading to band. With no speed this
            row would just repeat the en-dash already shown above. */}
        {band ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: cssVar(band.role) }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">
              {band.label}
              {force ? ` · Beaufort ${force.force}` : ''}
            </span>
          </div>
        ) : null}

        <span className="text-xs font-medium tabular-nums">
          {bearing != null ? `${Math.round(bearing)}° ${sector}` : 'No bearing'}
        </span>

        {/* The honest caption: at offset 0 the bearing is relative to the mast, so
            the dial must not imply true north. Shown only when there IS a bearing —
            with no reading at all it qualifies nothing. */}
        {!calibrated && bearing != null ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Relative to mast · uncalibrated</span>
        ) : null}
      </div>
    </div>
  );
}

/** Exported for tests and for the panel that hosts the dial. */
export const WIND_DIAL_FORCES = BEAUFORT;
