'use client';

import { useEffect, useRef } from 'react';
import { useOnReconnect } from './hooks';

/** A tab hidden longer than this may have missed live pushes → reconcile on return. */
export const CATCHUP_HIDDEN_THRESHOLD_MS = 15_000;

/**
 * Fires `onCatchup` whenever the client may have MISSED live events and must
 * reconcile with the server ("refetch is truth", §3.2). Two triggers:
 *   1. a socket **reconnect** — rooms + any events during the drop are lost;
 *   2. the tab returning to the **foreground** after being hidden a while — a
 *      backgrounded tab is throttled by the browser and can silently miss pushes
 *      even while the socket itself stays connected (the gap plain reconnect
 *      handling doesn't cover). A short flick away (<15s) is ignored to avoid churn.
 */
export function useRealtimeCatchup(onCatchup: () => void): void {
  const cbRef = useRef(onCatchup);
  cbRef.current = onCatchup;

  useOnReconnect(() => cbRef.current());

  const hiddenSince = useRef<number | null>(null);
  useEffect(() => {
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
      } else {
        const since = hiddenSince.current;
        hiddenSince.current = null;
        if (since != null && Date.now() - since > CATCHUP_HIDDEN_THRESHOLD_MS) cbRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
