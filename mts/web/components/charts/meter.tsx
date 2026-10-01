import { AlertTriangle, CheckCircle2, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A value against its limit — the form for "how close are we to the line?".
 *
 * The rainfall tally board is three of these, not a chart: each rule is one
 * number and one threshold, and the question is how full the bar is. The fill
 * carries the state (quiet → approaching → over), the track is a paler step of
 * the same family, and the state is also written in words beside an icon, so
 * the meter reads the same in greyscale or to a colour-blind controller.
 *
 * The scale runs to 125 % of the limit, so a breach visibly overshoots the tick
 * rather than stopping dead at a full bar.
 */
export function Meter({
  label,
  sublabel,
  value,
  limit,
  unit,
  compact,
  digits = 1,
}: {
  label: string;
  sublabel?: string;
  value: number;
  limit: number;
  unit: string;
  compact?: boolean;
  /** Decimal places; counts are whole numbers. */
  digits?: number;
}) {
  const scaleMax = limit * 1.25;
  const pct = Math.max(0, Math.min(1, value / scaleMax));
  const ratio = value / limit;
  const state = ratio >= 1 ? 'over' : ratio >= 0.5 ? 'near' : 'quiet';
  const Icon = state === 'over' ? AlertTriangle : state === 'near' ? CircleDot : CheckCircle2;
  // Floor, never round: 119.6 of 120 is 99 %, and "100 %" would read as a breach.
  const word = state === 'over' ? 'Over threshold' : state === 'near' ? `${Math.floor(ratio * 100)} % of threshold` : 'Below';

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{label}</span>
          {sublabel ? <span> · {sublabel}</span> : null}
        </p>
        {/* Proportional figures: tabular digits look loose at this size. */}
        <p className={cn('shrink-0 font-semibold', compact ? 'text-sm' : 'text-base')}>
          {value.toFixed(digits)}
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
            / {limit} {unit}
          </span>
        </p>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scaleMax}
        aria-valuenow={value}
        aria-label={`${label}: ${value.toFixed(digits)} of ${limit} ${unit}`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            state === 'over' ? 'bg-sev-alert' : state === 'near' ? 'bg-sev-warning' : 'bg-primary',
          )}
          style={{ width: `${pct * 100}%` }}
        />
        {/* The threshold, as a notch in the track. */}
        <span className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${(1 / 1.25) * 100}%` }} aria-hidden />
      </div>
      <p
        className={cn(
          'mt-1 flex items-center gap-1 text-[11px]',
          state === 'over' ? 'text-sev-alert-strong' : state === 'near' ? 'text-sev-warning-strong' : 'text-muted-foreground',
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {word}
      </p>
    </div>
  );
}
