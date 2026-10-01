import { PARAM_COLOR } from '@/lib/viz/roles';
import { fmtSigned } from '@/lib/format';

/**
 * The sump, drawn to scale: where the water is against every set point the
 * OMC-048 acts on (§5.6).
 *
 * The level chart answers "what has it been doing?". This answers the question
 * a pump controller actually has at the moment of decision — "which lines are we
 * above, and how far is it to the next one?" — which a time series makes you
 * work out by reading two axes. The dead-band between L-stop and L-start is
 * shaded, because that is the gap that keeps the pumps from hunting.
 */
export interface SetPoint {
  value: number;
  label: string;
  /** `critical` for the line that blocks the railway; `action` for plant set points. */
  tone: 'critical' | 'action' | 'info';
}

/** Spread labels at least 13 px apart, keeping each as close to its line as it can. */
function labelPositions(setpoints: SetPoint[], y: (v: number) => number) {
  const placed = [...setpoints].sort((a, b) => b.value - a.value).map((s) => ({ s, ly: y(s.value) }));
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].ly - placed[i - 1].ly < 13) placed[i].ly = placed[i - 1].ly + 13;
  }
  return placed;
}

export function LevelGauge({
  level,
  setpoints,
  max,
  deadBand,
}: {
  level: number;
  setpoints: SetPoint[];
  max: number;
  deadBand?: [number, number];
}) {
  const h = 240;
  const top = 10;
  const bottom = 18;
  const plot = h - top - bottom;
  const y = (v: number) => top + plot - (Math.max(0, Math.min(max, v)) / max) * plot;
  const tankX = 18;
  const tankW = 58;
  const water = PARAM_COLOR.water_level;
  const above = setpoints.filter((s) => level >= s.value).length;

  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 280 ${h}`}
        className="block w-full max-w-[340px]"
        role="img"
        aria-label={`Water level ${fmtSigned(level)} mm; above ${above} of ${setpoints.length} set points`}
      >
        {/* The tank and its dead-band. */}
        <rect x={tankX} y={top} width={tankW} height={plot} rx={4} fill="hsl(var(--muted))" />
        {deadBand ? (
          <rect
            x={tankX}
            y={y(deadBand[1])}
            width={tankW}
            height={y(deadBand[0]) - y(deadBand[1])}
            fill="hsl(var(--band-warning))"
            opacity={0.6}
          />
        ) : null}

        {/* Water: the parameter's own colour as a wash, with a firm surface line. */}
        <rect x={tankX} y={y(level)} width={tankW} height={top + plot - y(level)} rx={2} fill={water} opacity={0.22} />
        <line x1={tankX} x2={tankX + tankW} y1={y(level)} y2={y(level)} stroke={water} strokeWidth={2.5} />
        <text x={tankX + tankW / 2} y={y(level) - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="hsl(var(--foreground))">
          {fmtSigned(level)}
        </text>

        {/* Set points, each labelled with its value and meaning. Labels that would
            overlap (float trip sits 5 mm under L-start) are nudged apart and
            joined to their line by a short leader. */}
        {labelPositions(setpoints, y).map(({ s, ly }) => {
          const colour =
            s.tone === 'critical'
              ? 'hsl(var(--threshold))'
              : s.tone === 'action'
                ? 'hsl(var(--foreground))'
                : 'hsl(var(--muted-foreground))';
          const passed = level >= s.value;
          return (
            <g key={s.label}>
              <line
                x1={tankX - 6}
                x2={tankX + tankW + 8}
                y1={y(s.value)}
                y2={y(s.value)}
                stroke={colour}
                strokeWidth={s.tone === 'critical' ? 1.8 : 1.2}
                strokeDasharray="5 3"
              />
              {Math.abs(ly - y(s.value)) > 1 ? (
                <line x1={tankX + tankW + 8} x2={tankX + tankW + 13} y1={y(s.value)} y2={ly} stroke={colour} strokeWidth={1} />
              ) : null}
              <text x={tankX + tankW + 14} y={ly + 4} fontSize={11} fill="hsl(var(--foreground))" fontWeight={passed ? 600 : 400}>
                <tspan className="tabular">{s.value}</tspan>
                <tspan fill="hsl(var(--muted-foreground))" fontWeight={400}>
                  {' '}
                  {s.label}
                </tspan>
                {passed ? <tspan fill={colour}> ✓</tspan> : null}
              </text>
            </g>
          );
        })}
        <text x={tankX} y={h - 3} fontSize={10} fill="hsl(var(--muted-foreground))">
          mm above datum (§5.6)
        </text>
      </svg>
      <figcaption className="sr-only">
        {setpoints.map((s) => `${s.label} ${s.value} mm${level >= s.value ? ' (passed)' : ''}`).join('; ')}
      </figcaption>
    </figure>
  );
}
