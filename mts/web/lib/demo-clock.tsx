'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { now } from '@/lib/mock/clock';

/**
 * One ticking clock for the whole app.
 *
 * A single interval at the provider, broadcast through context — rather than an
 * interval per component, which is how a dashboard with forty timestamps ends up
 * repainting forty times a second. A frozen clock makes a live system look dead,
 * so this is the smallest piece of "aliveness" worth having.
 */
const ClockContext = createContext<number>(0);

export function DemoClockProvider({ children }: { children: ReactNode }) {
  /**
   * Starts at 0, not at `now()`.
   *
   * The server renders this component too, and its clock is a few hundred
   * milliseconds behind the browser's by the time hydration runs — which React
   * reports as a mismatch. So nothing time-dependent is rendered until the first
   * client tick, and `useDemoClock()` returning 0 means "not mounted yet".
   */
  const [t, setT] = useState<number>(0);

  useEffect(() => {
    setT(now());
    const id = setInterval(() => setT(now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <ClockContext.Provider value={t}>{children}</ClockContext.Provider>;
}

export function useDemoClock(): number {
  return useContext(ClockContext);
}

/** For components that need a stable "now" for a render pass. */
export function useNow(): number {
  const t = useDemoClock();
  return useMemo(() => t, [t]);
}
