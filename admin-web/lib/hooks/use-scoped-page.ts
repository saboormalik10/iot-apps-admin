'use client';

import { useState } from 'react';
import { useScope } from './use-scope';

/**
 * Page state for a list driven by the global Scope Bar.
 *
 * A page number only means something relative to a filter. Change the device or
 * the date range while on page 3 and page 3 of the NEW result set may not exist
 * — the request succeeds and returns nothing, so the table renders "No results."
 * and the filter looks broken. Worse, the lists that use `keepPreviousData` show
 * the PREVIOUS device's rows until that empty page lands.
 *
 * Pages with their own local filters (`sessions`, `devices`, `alerts`) already
 * call `setPage(1)` from their change handlers. Scope lives in the URL and has
 * no such handler, so the reset has to be derived from the scope itself — which
 * is what this hook does, once, for every list that reads it.
 *
 * WHY NOT `useEffect`
 * Adjusting state during render is React's documented pattern for "reset state
 * when a value changes". An effect would render the doomed page first, fire a
 * request for it, and only then reset — the exact wasted fetch this exists to
 * prevent. React re-runs this component immediately on the `set` calls below,
 * before touching the DOM or running effects, so the bad page is never queried.
 */
export function useScopedPage(): [number, (page: number) => void] {
  const { scope, window } = useScope();

  // Everything that changes which rows exist. `window` is memoised inside
  // `useScope` and advances at most once a minute, so this is stable.
  const key = `${scope.deviceId ?? ''}|${scope.deviceType ?? ''}|${window.from}|${window.to}`;

  const [page, setPage] = useState(1);
  const [scopeKey, setScopeKey] = useState(key);

  if (key !== scopeKey) {
    setScopeKey(key);
    if (page !== 1) setPage(1);
    // React discards this render and re-runs immediately, so the value below is
    // never committed — but it is returned honestly rather than handing back a
    // page number that has already been invalidated.
    return [1, setPage];
  }

  return [page, setPage];
}
