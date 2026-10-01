'use client';

import type { WindRoseBin } from '@/lib/api/types';
import { ORD } from '@/lib/viz/roles';
import { HoverTip, TipRow, useHoverTip } from './hover-tip';

/**
 * Where the wind comes from, and how hard.
 *
 * A line of wind speed says nothing about direction, and direction is what the
 * wind rules depend on: the TSR applies at the listed kilometrages because some
 * spans are exposed to a crosswind from one quarter and sheltered from another.
 * The rose shows both at once — each spoke is a compass sector, its length is
 * how often the wind blew from there, and the bands along it are speeds.
 *
 * Speeds are ORDERED, so they take the ordinal ramp (one hue, light to dark),
 * not five unrelated colours — a reader sees "darker is stronger" without the
 * legend. Sectors are separated by a 2° gap in the surface colour, not outlined.
 */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  // Compass angles: 0° is north, clockwise.
  const pt = (r: number, a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = pt(r1, a0);
  const [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1);
  const [x3, y3] = pt(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

export function WindRose({
  bins,
  bandLabels,
  unit,
  calmPct,
}: {
  bins: WindRoseBin[];
  bandLabels: string[];
  unit: string;
  calmPct: number;
}) {
  const { ref, tip, bind } = useHoverTip();
  const size = 260;
  const c = size / 2;
  const rMax = c - 26;
  const rMin = 8;
  const totals = bins.map((b) => b.bands.reduce((a, x) => a + x, 0));
  const peak = Math.max(...totals, 0.01);
  // Rings at clean percentages.
  const ringStep = peak > 0.3 ? 0.1 : peak > 0.15 ? 0.05 : 0.025;
  const ringTop = Math.ceil(peak / ringStep) * ringStep;
  const r = (share: number) => rMin + (share / ringTop) * (rMax - rMin);
  const rings: number[] = [];
  for (let s = ringStep; s <= ringTop + 1e-9; s += ringStep) rings.push(s);
  const sector = 360 / bins.length;
  const gap = 2;

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[250px]" role="img" aria-label="Wind rose">
        {rings.map((s) => (
          <g key={s}>
            <circle cx={c} cy={c} r={r(s)} fill="none" stroke="hsl(var(--grid))" />
            <text x={c + 3} y={c - r(s) - 2} fontSize={9} fill="hsl(var(--muted-foreground))">
              {Math.round(s * 100)}%
            </text>
          </g>
        ))}
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1={c}
            y1={c}
            x2={c + rMax * Math.cos(((a - 90) * Math.PI) / 180)}
            y2={c + rMax * Math.sin(((a - 90) * Math.PI) / 180)}
            stroke="hsl(var(--grid))"
          />
        ))}

        {bins.map((b, i) => {
          let acc = 0;
          const a0 = b.dirDeg - sector / 2 + gap / 2;
          const a1 = b.dirDeg + sector / 2 - gap / 2;
          return (
            <g key={b.dirDeg}>
              {b.bands.map((share, j) => {
                if (share <= 0) return null;
                const inner = r(acc);
                acc += share;
                const outer = r(acc);
                return (
                  <path
                    key={j}
                    d={wedge(c, c, inner, outer, a0, a1)}
                    fill={ORD[j]}
                    stroke="hsl(var(--chart-surface))"
                    strokeWidth={1}
                    className="outline-none focus-visible:opacity-80"
                    {...bind(
                      <>
                        <p className="mb-1 font-medium">From the {COMPASS[i]} ({b.dirDeg}°)</p>
                        <TipRow value={`${(share * 100).toFixed(1)} %`} label={`of the time at ${bandLabels[j]} ${unit}`} swatch={ORD[j]} />
                        <p className="mt-0.5 text-muted-foreground">{(totals[i] * 100).toFixed(1)} % of all hours from this sector</p>
                      </>,
                    )}
                  />
                );
              })}
            </g>
          );
        })}

        {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
          const a = i * 90;
          const rr = rMax + 14;
          return (
            <text
              key={l}
              x={c + rr * Math.cos(((a - 90) * Math.PI) / 180)}
              y={c + rr * Math.sin(((a - 90) * Math.PI) / 180) + 4}
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
              fill="hsl(var(--foreground))"
            >
              {l}
            </text>
          );
        })}
      </svg>

      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {bandLabels.map((l, j) => (
          <li key={l} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[2px]" style={{ background: ORD[j] }} aria-hidden />
            {l}
          </li>
        ))}
        <li>{unit}</li>
        <li>· calm {calmPct.toFixed(0)} %</li>
      </ul>

      <HoverTip tip={tip} width={300} />
    </div>
  );
}

export { COMPASS };
