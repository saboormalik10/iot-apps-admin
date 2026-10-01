'use client';

import { SERIES } from '@/lib/viz/roles';
import { HoverTip, TipRow, useHoverTip } from './hover-tip';

/**
 * How long alerts took to arrive, per channel, against the obligation.
 *
 * An average hides the one late alert that matters, so each channel shows its
 * spread instead: the bar runs from the median to the 95th percentile, the dot
 * is the slowest single delivery, and the dashed line is the §7.1 limit. "All
 * inside the line" is the claim, and the chart lets a reviewer check it.
 *
 * One measure across channels, so every bar is the same colour — the channel is
 * named on the row, not encoded in a hue.
 */
export function RangeBars({
  rows,
  slaSeconds,
}: {
  rows: { label: string; p50: number; p95: number; max: number; n: number; within: number }[];
  slaSeconds: number;
}) {
  const { ref, tip, bind } = useHoverTip();
  const top = Math.max(slaSeconds * 1.08, ...rows.map((r) => r.max));
  const x = (s: number) => (s / top) * 100;
  const fmt = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
  const ticks = [0, 60, 120, 180, 240, 300].filter((t) => t <= top);
  const colour = SERIES[0];

  return (
    <div ref={ref} className="relative">
      {/* The limit line is drawn inside this wrapper, so it spans the rows and
          the axis and stops there — it used to run on through the legend. */}
      <div className="relative">
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-3">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <p className="text-xs">
              <span className="font-medium">{r.label}</span>
              <span className="block text-[11px] text-muted-foreground">
                {r.within}/{r.n} in time
              </span>
            </p>
            <div className="relative h-8">
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${x(t)}%` }} aria-hidden />
              ))}
              <span
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: `${x(r.p50)}%`, width: `max(4px, ${x(r.p95) - x(r.p50)}%)`, background: colour }}
                role="img"
                aria-label={`${r.label}: median ${fmt(r.p50)}, 95th percentile ${fmt(r.p95)}, slowest ${fmt(r.max)}`}
                {...bind(
                  <>
                    <p className="mb-1 font-medium">{r.label}</p>
                    <TipRow value={fmt(r.p50)} label="median" />
                    <TipRow value={fmt(r.p95)} label="95th percentile" />
                    <TipRow value={fmt(r.max)} label="slowest" />
                  </>,
                )}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                style={{ left: `${x(r.max)}%`, background: colour }}
                aria-hidden
              />
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-4 text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="tabular absolute -translate-x-1/2" style={{ left: `${x(t)}%` }}>
              {t === 0 ? '0' : `${t / 60} min`}
            </span>
          ))}
        </div>
      </div>
      {/* The obligation, dashed like every other threshold, drawn across all rows. */}
      <div className="pointer-events-none absolute bottom-5 left-[6.25rem] right-0 top-0" aria-hidden>
        <span className="absolute inset-y-0 border-l-2 border-dashed border-[hsl(var(--threshold))]" style={{ left: `${x(slaSeconds)}%` }} />
      </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded" style={{ background: colour }} aria-hidden /> median → 95th percentile
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} aria-hidden /> slowest
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-dashed border-[hsl(var(--threshold))]" aria-hidden /> {slaSeconds / 60}-minute limit (§7.1)
        </li>
      </ul>
      <HoverTip tip={tip} width={600} />
    </div>
  );
}
