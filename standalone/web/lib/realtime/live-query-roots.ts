/**
 * Query-key ROOTS whose data is fed (in whole or part) by realtime and must be
 * reconciled after a missed-event window (reconnect / tab-return). Prefix-matched
 * by TanStack Query, so `['dashboard']` covers every `['dashboard', …]` key, etc.
 * Deliberately scoped: static reads (audit, org, profile, users) are NOT here, so
 * a reconnect no longer nukes the entire cache — only the live surfaces refetch.
 */
export const LIVE_QUERY_ROOTS: string[][] = [
  ['dashboard'],
  ['analytics'],
  ['sessions'],
  ['records'],
  ['devices'],
  ['alert-rules'],
  ['notifications'],
  ['share'],
];
