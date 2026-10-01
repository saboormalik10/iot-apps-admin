import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { fmtSigned } from '@/lib/format';

/**
 * Figure 8's "affected vicinity" inset: the stretch of line between the two
 * Marrickville-vicinity monitoring points, drawn as a strip map.
 *
 * It answers the question the chart cannot — *where* on the line is the water —
 * by placing both points at their kilometrage, colouring each by its state, and
 * shading the section of track that is at or above standing water. The pump
 * station sits where it is, with its running state beside it. Schematic and not
 * to scale; the kilometrages are provisional until MTS confirms them (§15).
 */
interface Point {
  label: string;
  km: number;
  level: number | null;
  pump?: { running: number };
}

export function VicinityInset({ points }: { points: Point[] }) {
  const F = THRESHOLDS.flood;
  const W = 320;
  const H = 150;
  const kmFrom = 6.3;
  const kmTo = 7.5;
  const x = (km: number) => 24 + ((km - kmFrom) / (kmTo - kmFrom)) * (W - 48);
  const lineY = 70;
  const tone = (lvl: number | null) =>
    lvl === null
      ? 'hsl(var(--sev-offline))'
      : lvl >= F.railFootMm
        ? 'hsl(var(--sev-alert))'
        : lvl >= F.standingWaterMm
          ? 'hsl(var(--sev-alert))'
          : lvl >= F.approachMm
            ? 'hsl(var(--sev-warning))'
            : 'hsl(var(--sev-normal))';
  const wet = points.filter((p) => (p.level ?? 0) >= F.standingWaterMm);
  const ticks = [6.4, 6.6, 6.8, 7.0, 7.2, 7.4];

  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full rounded-md border bg-muted/40" role="img" aria-label="Affected vicinity strip map">
        {/* Cooks River, for orientation */}
        <path d={`M 0,${H - 22} C 80,${H - 34} 150,${H - 10} 230,${H - 26} S 300,${H - 18} ${W},${H - 30}`} fill="none" stroke="hsl(var(--chart-1))" strokeOpacity="0.25" strokeWidth="9" />
        <text x="8" y={H - 6} fontSize="8" fill="hsl(var(--muted-foreground))">
          Cooks River
        </text>

        {/* The affected section: shaded from the first to the last wet point (± 100 m). */}
        {wet.length ? (
          <rect
            x={x(Math.min(...wet.map((p) => p.km)) - 0.1)}
            y={lineY - 12}
            width={x(Math.max(...wet.map((p) => p.km)) + 0.1) - x(Math.min(...wet.map((p) => p.km)) - 0.1)}
            height={24}
            rx={4}
            fill="hsl(var(--sev-alert))"
            fillOpacity="0.14"
            stroke="hsl(var(--sev-alert))"
            strokeOpacity="0.5"
            strokeDasharray="3 2"
          />
        ) : null}

        {/* the line, up and down tracks */}
        <line x1="12" x2={W - 12} y1={lineY - 3} y2={lineY - 3} stroke="hsl(var(--primary))" strokeWidth="2" />
        <line x1="12" x2={W - 12} y1={lineY + 3} y2={lineY + 3} stroke="hsl(var(--primary))" strokeWidth="2" />
        <text x="12" y={lineY - 8} fontSize="7" fill="hsl(var(--muted-foreground))">
          up
        </text>
        <text x="12" y={lineY + 13} fontSize="7" fill="hsl(var(--muted-foreground))">
          down
        </text>

        {/* chainage */}
        {ticks.map((k) => (
          <g key={k}>
            <line x1={x(k)} x2={x(k)} y1={lineY + 16} y2={lineY + 20} stroke="hsl(var(--muted-foreground))" />
            <text x={x(k)} y={lineY + 29} fontSize="7" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontStyle="italic">
              {k.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={W - 12} y="14" fontSize="7" textAnchor="end" fill="hsl(var(--muted-foreground))">
          chainage, km MSW (provisional)
        </text>

        {/* the monitoring points */}
        {points.map((p, i) => {
          const cx = x(p.km);
          const above = i % 2 === 0;
          return (
            <g key={p.label}>
              <circle cx={cx} cy={lineY} r="7" fill="hsl(var(--card))" stroke={tone(p.level)} strokeWidth="2.5" />
              <circle cx={cx} cy={lineY} r="3" fill={tone(p.level)} />
              <text x={cx} y={above ? lineY - 22 : lineY + 44} fontSize="8.5" fontWeight="600" textAnchor="middle" fill="hsl(var(--foreground))">
                {p.label}
              </text>
              <text x={cx} y={above ? lineY - 12 : lineY + 54} fontSize="8" textAnchor="middle" fill="hsl(var(--muted-foreground))">
                {p.level === null ? 'no data' : `${fmtSigned(p.level)} mm`}
              </text>
              {p.pump ? (
                <g>
                  <rect x={cx - 9} y={lineY + 34} width="18" height="13" rx="2" fill="hsl(var(--card))" stroke="hsl(var(--op-running))" />
                  <text x={cx} y={lineY + 43.5} fontSize="8" fontWeight="700" textAnchor="middle" fill="hsl(var(--op-running))">
                    P
                  </text>
                  <text x={cx + 13} y={lineY + 44} fontSize="7.5" fill="hsl(var(--foreground))">
                    {p.pump.running ? `${p.pump.running} running` : 'stopped'}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm border border-dashed border-sev-alert bg-sev-alert/15" aria-hidden /> at or above standing water
        </span>
        <span>P = pump station</span>
        <span>Schematic, not to scale</span>
      </figcaption>
    </figure>
  );
}
