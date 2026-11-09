'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The map's legend, minimised to a small "Legend" tab and expanded again on click
 * (client, 9 Nov 2026), so it does not cover the stations. The choice is shared by
 * the plain, map and satellite views and remembered in this browser.
 */

const KEY = 'mts.legend-open';

export function MapLegend({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'false') setOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, []);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(KEY, String(!open));
    } catch {
      /* not remembered, still toggled */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        className={cn(
          'flex items-center gap-1 whitespace-nowrap rounded-md border bg-card/95 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        Legend <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border bg-card/95 p-3 text-[11px] shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Legend</p>
        <button
          type="button"
          onClick={toggle}
          aria-expanded
          aria-label="Minimise the legend"
          className="-mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}
