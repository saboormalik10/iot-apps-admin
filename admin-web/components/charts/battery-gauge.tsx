import { cssVar, type PaletteRole } from '@/lib/api/scales';
import { fmt } from './chart-utils';
import { cn } from '@/lib/utils';

/** Charge band → status role: low=error, mid=warn, healthy=ok (never raw hex, §10.9). */
function chargeRole(pct: number): PaletteRole {
  if (pct <= 20) return 'status-error';
  if (pct <= 50) return 'status-warn';
  return 'status-ok';
}

/**
 * BatteryGauge — a battery icon whose fill is proportional to charge. The raw
 * value is a voltage; it's mapped to a % of a nominal range (default 10–15 V) for
 * the fill, but the VOLTAGE is what's shown (plan §5.3). Distinct from the
 * horizontal `Meter` bar. Colour (charge band) is always paired with the numeric
 * value + unit, and the widget is `role="meter"` with aria-valuenow/min/max (§7).
 * A null reading shows an empty cell and an en-dash, never a fabricated 0 (§10.2).
 */
export function BatteryGauge({
  value,
  min = 10,
  max = 15,
  label,
  unit = 'V',
  digits = 2,
  className,
}: {
  value: number | null;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  digits?: number;
  className?: string;
}) {
  const hasValue = value != null && !Number.isNaN(value);
  const pct = hasValue ? Math.min(100, Math.max(0, ((value! - min) / (max - min)) * 100)) : 0;
  const role = hasValue ? chargeRole(pct) : 'status-offline';
  const color = cssVar(role);

  // Battery body geometry.
  const bodyX = 3;
  const bodyY = 6;
  const bodyW = 60;
  const bodyH = 28;
  const pad = 4;
  const innerW = bodyW - pad * 2;
  const fillW = (pct / 100) * innerW;

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="meter"
      aria-valuenow={hasValue ? value! : undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
    >
      <svg width={74} height={40} viewBox="0 0 74 40" role="presentation">
        {/* Body outline */}
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={4} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
        {/* Terminal cap */}
        <rect x={bodyX + bodyW} y={bodyY + bodyH / 2 - 6} width={5} height={12} rx={2} fill="hsl(var(--border))" />
        {/* Fill */}
        {hasValue && fillW > 0 ? (
          <rect x={bodyX + pad} y={bodyY + pad} width={fillW} height={bodyH - pad * 2} rx={2} fill={color} />
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
        <span className="text-[10px] tabular-nums text-muted-foreground">{hasValue ? `${Math.round(pct)}% charge` : '–'}</span>
      </div>
    </div>
  );
}
