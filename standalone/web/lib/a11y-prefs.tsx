'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Accessibility preferences (plan §Month 12). Currently one: the chart texture
 * channel, which adds a directional-fill encoding on top of hue so series stay
 * distinguishable under full-severity CVD.
 *
 * The preference only drives the OPT-IN case. Print and forced-colors turn the
 * same channel on via CSS alone (see app/globals.css) — they must work without a
 * React render, so this context is deliberately not their trigger.
 *
 * State lives on <html data-texture>, not in a class on a provider div, because
 * the pattern ink is styled from a global stylesheet and the SVG <defs> that
 * consume it are rendered deep inside each chart.
 */
const STORAGE_KEY = 'obs.texture';

interface A11yPrefsValue {
  /** Whether the user opted the texture channel on. */
  texture: boolean;
  setTexture: (on: boolean) => void;
  toggleTexture: () => void;
}

const A11yPrefsContext = createContext<A11yPrefsValue | null>(null);

export function A11yPrefsProvider({ children }: { children: ReactNode }) {
  const [texture, setTextureState] = useState(false);

  // Read once on mount. SSR renders texture-off, which is also the default, so
  // there is no hydration mismatch — only a persisted "on" flips it after paint.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'on') setTextureState(true);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (texture) root.setAttribute('data-texture', 'on');
    else root.removeAttribute('data-texture');
  }, [texture]);

  const setTexture = useCallback((on: boolean) => {
    setTextureState(on);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  }, []);

  const value = useMemo<A11yPrefsValue>(
    () => ({ texture, setTexture, toggleTexture: () => setTexture(!texture) }),
    [texture, setTexture],
  );

  return <A11yPrefsContext.Provider value={value}>{children}</A11yPrefsContext.Provider>;
}

export function useA11yPrefs(): A11yPrefsValue {
  const ctx = useContext(A11yPrefsContext);
  if (!ctx) throw new Error('useA11yPrefs must be used within <A11yPrefsProvider>');
  return ctx;
}
