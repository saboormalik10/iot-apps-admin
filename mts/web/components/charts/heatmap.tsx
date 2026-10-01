'use client';

import { useEffect, useState } from 'react';
import { SEQ } from '@/lib/viz/roles';
import { HoverTip, TipRow, useHoverTip } from './hover-tip';

/**
 * A grid of magnitudes — here, rainfall by hour across the last fortnight.
 *
 * A trend line makes one storm look like everything; the grid shows the pattern
 * a line hides: how often it rains, at what time of day, how long an event
 * lasts, and how this afternoon compares with a normal one.
 *
 * Magnitude is one hue, light to dark (flipped in dark mode so "nothing" sinks
 * into the surface), in seven classes with the scale printed underneath — never
 * a rainbow. A dry hour is the muted surface rather than the palest blue, so
 * "no rain" and "a little rain" are different things. Hours that have not
 * happened yet are left empty, not drawn as zero.
 */
export function Heatmap({
  rows,
  columns,
  unit,
  max,
  valueName,
}: {
  rows: { label: string; cells: number[] }[];
  columns: string[];
  unit: string;
  /** Top of the scale; values above it take the darkest class. */
  max: number;
  valueName: string;
}) {
  const { ref, tip, bind } = useHoverTip();
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const step = max / SEQ.length;
  const colour = (v: number) => {
    if (Number.isNaN(v)) return 'transparent';
    if (v < 0.1) return 'hsl(var(--muted))';
    return SEQ[Math.min(SEQ.length - 1, Math.floor(v / step))];
  };
  // Label every column on a wide screen, every sixth hour on a phone.
  const every = width < 520 ? 6 : width < 900 ? 3 : 1;

  return (
    <div ref={ref} className="relative">
      <div className="grid gap-x-2" style={{ gridTemplateColumns: 'minmax(0,3.5rem) 1fr' }}>
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <p className="tabular truncate py-px text-right text-[11px] leading-[14px] text-muted-foreground">{r.label}</p>
            <div className="grid gap-[2px] py-px" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {r.cells.map((v, i) => (
                <span
                  key={i}
                  role="img"
                  aria-label={Number.isNaN(v) ? `${r.label} ${columns[i]}: not yet` : `${r.label} ${columns[i]}: ${v} ${unit}`}
                  {...(Number.isNaN(v)
                    ? {}
                    : bind(
                        <>
                          <p className="mb-1 font-medium">
                            {r.label} · {columns[i]}
                          </p>
                          <TipRow value={`${v.toFixed(1)} ${unit}`} label={valueName} swatch={colour(v)} />
                        </>,
                      ))}
                  className="h-3.5 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    background: colour(v),
                    border: Number.isNaN(v) ? '1px dashed hsl(var(--border))' : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <span />
        <div className="grid pt-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((c, i) => (
            <span key={c} className="tabular text-center text-[10.5px] text-muted-foreground">
              {i % every === 0 ? c : ''}
            </span>
          ))}
        </div>
      </div>

      {/* The scale, printed — the only way to read a colour back into a number. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-[2px] bg-muted" aria-hidden /> dry
        </span>
        <span className="flex items-center">
          {SEQ.map((c, i) => (
            <span key={c} className="flex flex-col items-center">
              <span className="h-3 w-6" style={{ background: c }} aria-hidden />
              <span className="tabular mt-0.5 text-[10px]">{i === 0 ? '0.1' : Math.round(step * i)}</span>
            </span>
          ))}
          <span className="ml-1 self-start">+ {unit}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-[2px] border border-dashed" aria-hidden /> not yet
        </span>
      </div>

      <HoverTip tip={tip} width={width} />
    </div>
  );
}
