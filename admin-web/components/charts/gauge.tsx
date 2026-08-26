import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { fmt } from './chart-utils';
import { cn } from '@/lib/utils';

/** An optional coloured threshold band drawn on the gauge track (status roles, never raw hex). */
export interface GaugeBand {
  /** Band start, in the same units as the gauge (defaults to the gauge min). */
  from?: number;
  /** Band end, in the same units as the gauge (defaults to the gauge max). */
  to?: number;
  role: PaletteRole;
  label?: string;
}

/**
 * Gauge — a radial arc gauge (semicircle by default) for a bounded live metric
 * (wind speed, humidity, pressure, solar, precip intensity). The value arc uses a
 * SEQUENTIAL magnitude token; optional threshold bands use RESERVED status tokens —
 * never the raw Parklife yellow/blue/red (plan §4 / §10.9). The colour is always
 * paired with a visible numeric value + unit, and the widget is exposed as
 * `role="meter"` with aria-valuenow/min/max — colour is never the only signal (§7).
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  unit,
  digits = 1,
  /** Arc sweep in degrees (180 = semicircle, up to 300 for a fuller dial). */
  sweep = 220,
  valueRole = 'seq-3',
  bands,
  size = 168,
  className,
}: {
  value: number | null;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  digits?: number;
  sweep?: number;
  valueRole?: PaletteRole;
  bands?: GaugeBand[];
  size?: number;
  className?: string;
}) {
  const span = Math.min(Math.max(sweep, 90), 340);
  const startAngle = 90 + span / 2; // symmetric around the bottom (SVG 0° = +x, CW)
  const endAngle = 90 - span / 2;

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const frac = (v: number) => (max === min ? 0 : (clamp(v) - min) / (max - min));
  // Angle for a value fraction: sweeps from startAngle → endAngle as frac 0 → 1.
  const angleFor = (v: number) => startAngle - frac(v) * span;

  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = Math.max(8, Math.round(size * 0.075));

  const hasValue = value != null && !Number.isNaN(value);
  const valueEnd = hasValue ? angleFor(value) : startAngle;

  // The track spans the full arc; the value arc goes start → value; bands are
  // sub-arcs clipped to [min,max]. Height reflects only the visible sweep.
  const arcHeight = arcBBoxHeight(size, cx, cy, r + strokeW / 2, startAngle, endAngle);

  // `role="meter"` REQUIRES aria-valuenow (axe: aria-required-attr, CRITICAL).
  // With no reading there is no value to report, so it is not a meter — it falls
  // back to an image with the same accessible name. Same rule already applied in
  // meter.tsx; it had not been propagated here.
  return (
    <div
      className={cn('flex flex-col items-center', className)}
      aria-label={label}
      {...(hasValue
        ? { role: 'meter', 'aria-valuenow': value!, 'aria-valuemin': min, 'aria-valuemax': max }
        : { role: 'img' })}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${arcHeight}`}
        style={{ maxWidth: size }}
        role="presentation"
      >
        {/* Track */}
        <path
          d={arcPath(cx, cy, r, startAngle, endAngle)}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Threshold bands (drawn on the track, inside the value arc) */}
        {bands?.map((b, i) => {
          const from = angleFor(b.from ?? min);
          const to = angleFor(b.to ?? max);
          return (
            <path
              key={i}
              d={arcPath(cx, cy, r, from, to)}
              fill="none"
              stroke={cssVar(b.role)}
              strokeWidth={strokeW * 0.42}
              strokeLinecap="butt"
              opacity={0.9}
            >
              {b.label ? <title>{b.label}</title> : null}
            </path>
          );
        })}
        {/* Value arc */}
        {hasValue && frac(value!) > 0 ? (
          <path
            d={arcPath(cx, cy, r, startAngle, valueEnd)}
            fill="none"
            stroke={cssVar(valueRole)}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        ) : null}
        {/* Needle tip dot */}
        {hasValue ? (
          <circle
            {...pointOnArc(cx, cy, r, valueEnd)}
            r={strokeW * 0.5}
            fill={cssVar(valueRole)}
          />
        ) : null}
      </svg>
      <div className="-mt-2 flex flex-col items-center gap-0.5 text-center">
        <span className="text-2xl font-semibold tabular-nums leading-none">
          {fmt(value, digits)}
          {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
        </span>
        {label ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        ) : null}
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {fmt(min, 0)}–{fmt(max, 0)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    </div>
  );
}

// ─── SVG arc helpers (degrees, standard math orientation: 0° = +x, CCW+) ─────

function pointOnArc(cx: number, cy: number, r: number, angleDeg: number): { cx: number; cy: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { cx: cx + r * Math.cos(a), cy: cy - r * Math.sin(a) };
}

/** Path for an arc from `startAngle` to `endAngle` (both in degrees), drawn clockwise. */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = pointOnArc(cx, cy, r, startAngle);
  const end = pointOnArc(cx, cy, r, endAngle);
  const delta = startAngle - endAngle; // clockwise sweep
  const largeArc = Math.abs(delta) > 180 ? 1 : 0;
  return `M ${start.cx} ${start.cy} A ${r} ${r} 0 ${largeArc} 1 ${end.cx} ${end.cy}`;
}

/** Visible height of the arc's bounding box, so the viewBox crops empty space below. */
function arcBBoxHeight(size: number, cx: number, cy: number, rOuter: number, startAngle: number, endAngle: number): number {
  // Sample the arc plus its endpoints to find the lowest point actually drawn.
  let maxY = cy;
  for (let a = endAngle; a <= startAngle; a += 2) {
    const y = cy - rOuter * Math.sin((a * Math.PI) / 180);
    if (y > maxY) maxY = y;
  }
  // If the arc dips below centre (sweep > 180), include that; else stop at centre + pad.
  return Math.min(size, Math.ceil(maxY) + 8);
}
