'use client';

import { useEffect, useState } from 'react';

/**
 * True on a phone-width screen.
 *
 * A chart sized for a desk is the wrong shape in a hand: 300 px of height on a
 * 375 px screen leaves room for one chart and nothing else, and ten time labels
 * collide into a smear. Charts read this to shorten themselves and thin their
 * ticks, rather than simply being squashed sideways.
 *
 * `false` on the server and on first paint, so the markup matches hydration.
 */
export function useCompact(query = '(max-width: 639px)'): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return compact;
}
