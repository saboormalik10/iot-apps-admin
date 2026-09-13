import type { MetMeasureRow } from '@/lib/api/types';

/**
 * Fold each environmental reading into a wind row at the same instant.
 *
 * Wind and environmental arrive as SEPARATE FILES, so they are stored as
 * separate rows: ~60 wind rows a minute carrying only wind, and one
 * environmental row a minute carrying only temperature, humidity and pressure.
 * Read literally that is correct, and in a table it looks broken — one line in
 * sixty has a temperature and no wind, which reads as a dropout.
 *
 * DISPLAY ONLY. Nothing is written; the stored rows are untouched.
 *
 * WHY NOT "GROUP BY TIMESTAMP"
 * The obvious version loses data. The sensor emits more than one wind reading
 * in the same second — two rows at 10:04:59 with different speeds is normal —
 * so collapsing every row sharing a timestamp would silently discard one of
 * them. Instead each environmental row is folded into exactly ONE wind row that
 * has no environmental values of its own, and every other row is left alone.
 *
 * WHY THE SAME MINUTE, NOT THE SAME SECOND
 * Matching on an exact timestamp almost never hits: the wind sensor is roughly
 * but not exactly 1 Hz, so a minute's readings land on :00, :02, :03, :04 and
 * the environmental row at :01 had no partner. Pinning it to the nearest wind
 * row in the SAME CLOCK MINUTE loses nothing in accuracy, because the value is
 * already the mean of that whole minute — which second it is shown against was
 * always arbitrary. Crossing a minute boundary would not be arbitrary, so it is
 * not allowed.
 *
 * An environmental row with no wind row in its minute stays on its own line
 * rather than being dropped or shifted into a minute it does not describe.
 */

/** The fields that only ever arrive on an environmental row. */
const ENV_FIELDS = ['tempC', 'humidityPct', 'pressureHpa', 'dewPointC'] as const;

const hasEnvironmental = (r: MetMeasureRow) => ENV_FIELDS.some((f) => r[f] != null);
const hasWind = (r: MetMeasureRow) => r.windSpeedMs != null || r.windDirTrueDeg != null || r.windDirRelDeg != null;

/** The clock minute a reading belongs to. */
const minuteOf = (ms: number) => Math.floor(ms / 60_000);

export function mergeMeasureRows(rows: readonly MetMeasureRow[]): MetMeasureRow[] {
  // Wind rows still free to receive an environmental reading, grouped by minute.
  // A list, not a single row: a minute holds ~60 of them and only one should
  // absorb the reading.
  const openWind = new Map<number, MetMeasureRow[]>();
  for (const r of rows) {
    if (hasWind(r) && !hasEnvironmental(r)) {
      const k = minuteOf(r.timestampMs);
      const list = openWind.get(k);
      if (list) list.push(r);
      else openWind.set(k, [r]);
    }
  }

  const absorbed = new Set<string>();
  const merged = new Map<string, MetMeasureRow>();

  for (const r of rows) {
    if (!hasEnvironmental(r) || hasWind(r)) continue;
    const candidates = openWind.get(minuteOf(r.timestampMs));
    if (!candidates || candidates.length === 0) continue; // no wind this minute

    // Closest in time, so the reading lands beside the wind it was taken with.
    let bestAt = 0;
    for (let i = 1; i < candidates.length; i++) {
      if (
        Math.abs(candidates[i].timestampMs - r.timestampMs) <
        Math.abs(candidates[bestAt].timestampMs - r.timestampMs)
      ) {
        bestAt = i;
      }
    }
    const [target] = candidates.splice(bestAt, 1);

    absorbed.add(r._id);
    merged.set(target._id, {
      ...target,
      tempC: r.tempC,
      humidityPct: r.humidityPct,
      pressureHpa: r.pressureHpa,
      dewPointC: r.dewPointC,
    });
  }

  // Order is preserved: the table is chronological and must stay that way.
  return rows.filter((r) => !absorbed.has(r._id)).map((r) => merged.get(r._id) ?? r);
}
