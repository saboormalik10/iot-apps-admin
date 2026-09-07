/**
 * Range presets and their resolution to an epoch-ms window.
 *
 * Deliberately free of React and Next imports so it can be exercised directly —
 * including in a subprocess under a different `TZ`, which is the only honest way
 * to prove the calendar presets follow the VIEWER rather than the server.
 */
export type RangePreset =
  | '1h'
  | '24h'
  | '7d'
  | '30d'
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7days';

/**
 * Two families of preset, because they answer different questions.
 *
 * `rolling` is a window ending NOW — "the last 60 minutes" — and is the same
 * instant everywhere on earth, so it needs no timezone.
 *
 * `day` is a CALENDAR window, and calendars are local. These resolve against the
 * VIEWER's midnight, so someone in Karachi and someone in Sydney asking for
 * "Today" each get their own day, not a day fixed to whoever set the server up.
 */
export type RangeKind = 'rolling' | 'day';

export interface RangePresetDef {
  key: RangePreset;
  labelKey: string;
  kind: RangeKind;
  /** Rolling only: window length. `null` means an open lower bound (all time). */
  ms?: number | null;
  /** Day only: whole local days back from today. 0 = today, 1 = yesterday. */
  daysBack?: number;
  /** Day only: stop at the START of today rather than at `now`. */
  endsAtMidnight?: boolean;
}

export const RANGE_PRESETS: RangePresetDef[] = [
  { key: '1h', labelKey: 'scope.range.1h', kind: 'rolling', ms: 3_600_000 },
  { key: '24h', labelKey: 'scope.range.24h', kind: 'rolling', ms: 86_400_000 },
  { key: '7d', labelKey: 'scope.range.7d', kind: 'rolling', ms: 7 * 86_400_000 },
  { key: '30d', labelKey: 'scope.range.30d', kind: 'rolling', ms: 30 * 86_400_000 },
  { key: 'all', labelKey: 'scope.range.all', kind: 'rolling', ms: null },
  { key: 'today', labelKey: 'scope.range.today', kind: 'day', daysBack: 0 },
  { key: 'yesterday', labelKey: 'scope.range.yesterday', kind: 'day', daysBack: 1, endsAtMidnight: true },
  { key: 'last7days', labelKey: 'scope.range.last7days', kind: 'day', daysBack: 6 },
];

/**
 * Local midnight, `daysBack` days ago.
 *
 * `setHours(0,0,0,0)` operates in the RUNTIME's timezone, which in the browser is
 * the viewer's — that is the whole point. Decrementing the DATE field and then
 * zeroing the clock is also the DST-correct order: subtracting 86,400,000 ms
 * lands an hour into the wrong day whenever the local day is 23 or 25 hours long.
 */
export function localMidnight(now: number, daysBack: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Resolve a preset to an epoch-ms window; `all` → an open (undefined) lower bound. */
export function rangeWindow(range: RangePreset, now = Date.now()): { from?: number; to: number } {
  const preset = RANGE_PRESETS.find((p) => p.key === range) ?? RANGE_PRESETS[1];

  if (preset.kind === 'day') {
    const from = localMidnight(now, preset.daysBack ?? 0);
    // "Yesterday" is a CLOSED day: it stops where today begins, so no reading is
    // ever counted in both.
    return { from, to: preset.endsAtMidnight ? localMidnight(now, 0) : now };
  }

  return preset.ms == null ? { to: now } : { from: now - preset.ms, to: now };
}
