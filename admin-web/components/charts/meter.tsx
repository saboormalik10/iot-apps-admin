import { cn } from '@/lib/utils';

/**
 * Meter — a labelled horizontal fill bar for bounded metrics (battery %, storage).
 * Tone is derived from thresholds and always paired with the numeric label, so it
 * never relies on colour alone (plan §4).
 */
export function Meter({
  value,
  max = 100,
  label,
  showValue = true,
  unit = '%',
  className,
}: {
  value: number | null;
  max?: number;
  label?: string;
  showValue?: boolean;
  unit?: string;
  className?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const tone =
    value == null ? 'bg-status-offline' : pct <= 15 ? 'bg-status-error' : pct <= 35 ? 'bg-status-warn' : 'bg-status-ok';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="relative h-2 w-full min-w-[3rem] overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      {showValue ? (
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {value == null ? '–' : `${Math.round(value)}${unit}`}
        </span>
      ) : null}
    </div>
  );
}
