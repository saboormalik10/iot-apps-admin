'use client';

import { AlertTriangle, CircleDot } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ExceedanceBand } from '@/lib/api/types';
import { fmtDuration, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HoverTip, TipRow, useHoverTip } from './hover-tip';

/**
 * Which location was over which line, and when — the whole corridor on one
 * time axis.
 *
 * It answers the first question at a shift handover ("what happened overnight?")
 * without opening seven station screens, and it shows the shape of an event: the
 * rain arriving at Marrickville, the water following it, the change reaching the
 * north-west an hour later.
 *
 * Severity is carried twice — by status colour AND by height: an alert band is
 * the full row, a warning band is half of it — so the two stay distinct in
 * greyscale and to a red-green colour-blind reader.
 */
export function BandTimeline({
  rows,
  bands,
  from,
  to,
}: {
  rows: { id: string; label: string }[];
  bands: ExceedanceBand[];
  from: number;
  to: number;
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

  const span = to - from;
  const x = (t: number) => ((t - from) / span) * 100;
  // Fewer ticks on a narrow screen, so the labels never collide.
  const tickHours = width < 480 ? 6 : width < 800 ? 4 : 2;
  const firstTick = Math.ceil(from / (tickHours * 3_600_000)) * tickHours * 3_600_000;
  const ticks: number[] = [];
  // Leave room at the right edge for the "now" label.
  for (let t = firstTick; t < to - span * 0.07; t += tickHours * 3_600_000) ticks.push(t);

  return (
    <div ref={ref} className="relative">
      <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
        {rows.map((r) => {
          const mine = bands.filter((b) => b.locationId === r.id);
          return (
            <div key={r.id} className="contents">
              <p className="truncate py-1.5 text-xs leading-5 text-muted-foreground" title={r.label}>
                {r.label}
              </p>
              <div className="relative my-1 h-5 rounded-sm bg-muted/60">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${x(t)}%` }} aria-hidden />
                ))}
                {mine.map((b, i) => (
                  <span
                    key={i}
                    role="img"
                    aria-label={`${r.label}: ${b.label} ${b.severity} from ${fmtTime(b.from)} to ${fmtTime(b.to)}`}
                    {...bind(
                      <>
                        <p className="mb-1 font-medium">{r.label}</p>
                        <TipRow
                          value={b.severity === 'alert' ? 'Alert' : 'Warning'}
                          label={b.label}
                          swatch={b.severity === 'alert' ? 'hsl(var(--sev-alert))' : 'hsl(var(--sev-warning))'}
                        />
                        <p className="tabular mt-0.5 text-muted-foreground">
                          {fmtTime(b.from)}–{fmtTime(b.to)} · {fmtDuration(b.to - b.from)}
                        </p>
                      </>,
                    )}
                    className={cn(
                      'absolute rounded-sm outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-ring',
                      b.severity === 'alert' ? 'inset-y-0 bg-sev-alert' : 'inset-y-[25%] bg-sev-warning',
                    )}
                    style={{ left: `${x(b.from)}%`, width: `max(4px, ${x(b.to) - x(b.from)}%)` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <span />
        <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="tabular absolute -translate-x-1/2" style={{ left: `${x(t)}%` }}>
              {fmtTime(t)}
            </span>
          ))}
          <span className="absolute right-0 font-medium text-foreground">now</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-sev-alert" aria-hidden />
          <AlertTriangle className="h-3 w-3 text-sev-alert-strong" aria-hidden /> Alert — full height
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-sm bg-sev-warning" aria-hidden />
          <CircleDot className="h-3 w-3 text-sev-warning-strong" aria-hidden /> Warning — half height
        </li>
      </ul>

      <HoverTip tip={tip} width={width} />
    </div>
  );
}
