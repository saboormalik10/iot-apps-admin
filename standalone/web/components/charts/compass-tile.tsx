import { fmt, COMPASS_16, sectorIndex } from './chart-utils';
import { cn } from '@/lib/utils';

/**
 * CompassTile — the wind-direction widget: a compass dial with a directional
 * arrow, plus the numeric bearing and its 16-point sector label (plan §7 item 7).
 * A tick/arrow is used, NOT a second axis (plan §4). A null bearing shows an
 * en-dash and no arrow, never a fabricated 0° (§10.2).
 */
export function CompassTile({
  deg,
  label = 'Wind direction',
  size = 96,
  className,
}: {
  deg: number | null;
  label?: string;
  size?: number;
  className?: string;
}) {
  const hasValue = deg != null && !Number.isNaN(deg);
  const bearing = hasValue ? ((deg! % 360) + 360) % 360 : null;
  const sector = bearing != null ? COMPASS_16[sectorIndex(bearing)] : '–';

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  return (
    <div
      className={cn('flex flex-col items-center gap-1', className)}
      role="img"
      aria-label={
        hasValue ? `${label}: ${Math.round(bearing!)} degrees, ${sector}` : `${label}: no data`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
        {/* Cardinal ticks */}
        {[0, 90, 180, 270].map((a) => {
          const rad = ((a - 90) * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={cx + (r - 5) * Math.cos(rad)}
              y1={cy + (r - 5) * Math.sin(rad)}
              x2={cx + r * Math.cos(rad)}
              y2={cy + r * Math.sin(rad)}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
            />
          );
        })}
        <text x={cx} y={12} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">N</text>
        {/* Arrow: points in the bearing direction (0° = N/up, clockwise). */}
        {bearing != null ? (
          <g transform={`rotate(${bearing} ${cx} ${cy})`}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - r + 8} stroke="hsl(var(--chart-1))" strokeWidth={2.5} strokeLinecap="round" />
            <polygon
              points={`${cx},${cy - r + 2} ${cx - 5},${cy - r + 12} ${cx + 5},${cy - r + 12}`}
              fill="hsl(var(--chart-1))"
            />
          </g>
        ) : null}
        <circle cx={cx} cy={cy} r={3} fill="hsl(var(--muted-foreground))" />
      </svg>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-xl font-semibold tabular-nums leading-none">
          {hasValue ? `${Math.round(bearing!)}°` : fmt(null)} <span className="text-sm font-normal text-muted-foreground">{sector}</span>
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
