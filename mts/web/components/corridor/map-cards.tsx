'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The reading cards on the map can be hidden, leaving only the numbered pins, and
 * shown again (client, 11 Nov 2026). The choice is shared by the plain, map and
 * satellite views and remembered in this browser, like the legend.
 */

const KEY = 'mts.map-cards-open';

export function useCardsOpen() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'false') setOpen(false);
    } catch {
      /* storage blocked: cards stay shown */
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
  return [open, toggle] as const;
}

export function CardsToggle({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = open ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!open}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-card/95 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {open ? 'Hide cards' : 'Show cards'}
    </button>
  );
}
