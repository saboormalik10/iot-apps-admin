'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Units context (plan §3.4). The admin's global toggle governs every chart/table
 * for consistent cross-device comparison. Wired to the backend
 * `/analytics/unit-convert` context — but NO chart consumes it until Month 8, so
 * Month 7 only establishes the toggle + persistence.
 */
export type UnitSystem = 'metric' | 'imperial';

const STORAGE_KEY = 'obs.units';

interface UnitsValue {
  system: UnitSystem;
  setSystem: (system: UnitSystem) => void;
  toggle: () => void;
}

const UnitsContext = createContext<UnitsValue | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>('metric');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'metric' || stored === 'imperial') setSystemState(stored);
  }, []);

  const setSystem = useCallback((next: UnitSystem) => {
    setSystemState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<UnitsValue>(
    () => ({ system, setSystem, toggle: () => setSystem(system === 'metric' ? 'imperial' : 'metric') }),
    [system, setSystem],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used within <UnitsProvider>');
  return ctx;
}
