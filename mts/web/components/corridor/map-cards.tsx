'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Each reading card on the map can be closed on its own (× on the card) and opened
 * again by clicking its pin; a button hides or shows them all (client, 11 Nov 2026).
 * Shared by the plain, map and satellite views and remembered in this browser.
 */

const KEY = 'mts.map-cards-closed';

/** Cards only appear from `xl`; below it a pin always opens the quick view. */
const WIDE = '(min-width: 1280px)';

export type Cards = {
  isOpen: (id: string) => boolean;
  open: (id: string) => void;
  close: (id: string) => void;
  /** Close every card if any is open, otherwise open them all. */
  toggleAll: (ids: string[]) => void;
};

export function useCards(): Cards {
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved)) setClosed(saved.filter((x) => typeof x === 'string'));
    } catch {
      /* storage blocked or unreadable: every card open */
    }
  }, []);
  const save = (next: string[]) => {
    setClosed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not remembered, still applied */
    }
  };
  return {
    isOpen: (id) => !closed.includes(id),
    open: (id) => save(closed.filter((x) => x !== id)),
    close: (id) => save(closed.includes(id) ? closed : [...closed, id]),
    toggleAll: (ids) => save(ids.some((id) => !closed.includes(id)) ? ids : []),
  };
}

/**
 * A pin click: brings back the station's closed card on a wide screen; otherwise
 * falls through to `fallback` (the quick view).
 */
export function pinClick(id: string, cards: Cards, fallback: (e: React.MouseEvent) => void) {
  return (e: React.MouseEvent) => {
    const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0;
    if (plain && !cards.isOpen(id) && window.matchMedia(WIDE).matches) {
      e.preventDefault();
      cards.open(id);
      return;
    }
    fallback(e);
  };
}

export function CardsToggle({
  anyOpen,
  onToggle,
  className,
}: {
  anyOpen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = anyOpen ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-card/95 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {anyOpen ? 'Hide all cards' : 'Show all cards'}
    </button>
  );
}

/** The × on a card. Sits on the card's corner, outside its link. */
export function CardClose({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`Close the ${name} card`}
      title="Close card — click the pin to open it again"
      className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="h-3 w-3" aria-hidden />
    </button>
  );
}
