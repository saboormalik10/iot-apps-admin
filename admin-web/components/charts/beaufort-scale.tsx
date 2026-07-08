import { beaufortFromMs, BEAUFORT } from '@/lib/api/scales';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * BeaufortScale — renders the current Beaufort force as a badge (force + label,
 * with the backend description as the tooltip). Values/labels are read verbatim
 * from `scales.ts` (mirrored from analytics.util.ts, §10.9), never reinvented.
 */
export function BeaufortBadge({ windMs, className }: { windMs: number | null; className?: string }) {
  if (windMs == null) return <Badge variant="offline" className={className}>Wind —</Badge>;
  const b = beaufortFromMs(windMs);
  const tone = b.force >= 8 ? 'error' : b.force >= 6 ? 'warn' : 'info';
  return (
    <Badge variant={tone} className={className} title={b.description}>
      F{b.force} · {b.label}
    </Badge>
  );
}

/** The full 0–12 reference strip (used in analytics + as a legend). */
export function BeaufortScale({ activeMs, className }: { activeMs?: number | null; className?: string }) {
  const active = activeMs != null ? beaufortFromMs(activeMs).force : -1;
  return (
    <ol className={cn('flex flex-wrap gap-1', className)} aria-label="Beaufort wind-force scale">
      {BEAUFORT.map((b) => (
        <li
          key={b.force}
          title={`${b.label} — ${b.description} (${b.minMs}–${b.maxMs === Infinity ? '∞' : b.maxMs} m/s)`}
          className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs tabular-nums',
            b.force === active ? 'bg-primary text-primary-foreground font-semibold' : 'bg-muted text-muted-foreground',
          )}
        >
          {b.force}
        </li>
      ))}
    </ol>
  );
}
