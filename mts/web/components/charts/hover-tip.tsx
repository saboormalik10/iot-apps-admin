'use client';

import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

/**
 * The hover layer for the hand-drawn charts (timeline, heatmap, rose, gauge).
 *
 * Recharts brings its own tooltip; these SVG charts share this one so they all
 * behave the same way: the readout follows the pointer, flips before it would
 * leave the chart, and appears on keyboard focus too — a tooltip that only a
 * mouse can open is a value a keyboard user cannot read.
 *
 * Tooltips enhance, never gate: every chart that uses this also has a table view.
 */

export interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

export function useHoverTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  /** Spread onto any SVG mark (or its larger hit area). */
  const bind = useCallback(
    (content: ReactNode) => ({
      tabIndex: 0,
      onPointerMove: (e: PointerEvent<Element>) => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
      },
      onPointerLeave: () => setTip(null),
      onFocus: (e: FocusEvent<Element>) => {
        const box = ref.current?.getBoundingClientRect();
        const mark = (e.target as Element).getBoundingClientRect();
        if (!box) return;
        setTip({ x: mark.left - box.left + mark.width / 2, y: mark.top - box.top, content });
      },
      onBlur: () => setTip(null),
    }),
    [],
  );

  return { ref, tip, bind };
}

export function HoverTip({ tip, width }: { tip: Tip | null; width?: number }) {
  if (!tip) return null;
  const flip = width !== undefined && tip.x > width - 180;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      style={{
        left: flip ? undefined : tip.x + 12,
        right: flip && width !== undefined ? width - tip.x + 12 : undefined,
        top: Math.max(0, tip.y - 12),
      }}
    >
      {tip.content}
    </div>
  );
}

/** A tooltip row: the value strong and first, the name after it. */
export function TipRow({ value, label, swatch }: { value: ReactNode; label: ReactNode; swatch?: string }) {
  return (
    <p className="flex items-center gap-2">
      {swatch ? <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: swatch }} aria-hidden /> : null}
      <span className="tabular font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}
