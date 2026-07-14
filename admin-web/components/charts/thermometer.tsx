import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { fmt } from './chart-utils';
import { cn } from '@/lib/utils';

/**
 * Temperature → colour band (cool→warm). Reuses the reserved status/sequential
 * tokens (never a raw hex, plan §10.9): cold=info, mild=ok, warm=warn, hot=error.
 */
function tempRole(c: number): PaletteRole {
  if (c >= 32) return 'status-error';
  if (c >= 24) return 'status-warn';
  if (c >= 10) return 'status-ok';
  if (c >= 0) return 'status-info';
  return 'seq-4';
}

/**
 * Thermometer — a vertical bulb + stem whose fill height = (value−min)/(max−min),
 * coloured by temperature band. For the temperature / dew-point live tiles (plan
 * §5.2). Colour is always paired with a visible numeric value + unit, and the
 * widget is `role="meter"` with aria-valuenow/min/max — never colour alone (§7).
 * A null reading shows an empty stem and an en-dash, never a fabricated 0 (§10.2).
 */
export function Thermometer({
  value,
  min = -10,
  max = 50,
  label,
  unit = '°C',
  digits = 1,
  height = 150,
  className,
}: {
  value: number | null;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  digits?: number;
  height?: number;
  className?: string;
}) {
  const hasValue = value != null && !Number.isNaN(value);
  const frac = hasValue ? Math.min(1, Math.max(0, (value! - min) / (max - min))) : 0;
  const role = hasValue ? tempRole(value!) : 'status-offline';
  const color = cssVar(role);

  // Geometry: a rounded stem above a bulb. The mercury fills the bulb, then rises
  // in the stem by `frac` of the stem's height.
  const W = 44;
  const stemW = 14;
  const bulbR = 15;
  const cx = W / 2;
  const stemTop = 8;
  const stemBottom = height - bulbR - 4; // where the stem meets the bulb
  const stemH = stemBottom - stemTop;
  const bulbCy = height - bulbR - 4;

  const fillTop = stemBottom - frac * stemH;

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="meter"
      aria-valuenow={hasValue ? value! : undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
    >
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="presentation">
        {/* Stem track */}
        <rect x={cx - stemW / 2} y={stemTop} width={stemW} height={stemH + bulbR} rx={stemW / 2} fill="hsl(var(--muted))" />
        {/* Bulb track */}
        <circle cx={cx} cy={bulbCy} r={bulbR} fill="hsl(var(--muted))" />
        {/* Bulb fill (always full when there's a reading — it's the reservoir) */}
        {hasValue ? <circle cx={cx} cy={bulbCy} r={bulbR - 3} fill={color} /> : null}
        {/* Mercury column */}
        {hasValue && frac > 0 ? (
          <rect
            x={cx - (stemW - 6) / 2}
            y={fillTop}
            width={stemW - 6}
            height={stemBottom - fillTop}
            rx={(stemW - 6) / 2}
            fill={color}
          />
        ) : null}
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-semibold tabular-nums leading-none">
          {fmt(value, digits)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </span>
        {label ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        ) : null}
      </div>
    </div>
  );
}
