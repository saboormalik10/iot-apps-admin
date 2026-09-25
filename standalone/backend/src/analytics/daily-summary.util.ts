/**
 * Daily-summary computation (§10.7) — pure functions, no DB access.
 *
 * Rolls a day's worth of MET measures into the premium daily analytics stored
 * on MetDailySummary. Reuses the domain math in analytics.util.ts (Beaufort,
 * pressure tendency, descriptive stats) so classification stays single-sourced.
 */
import {
  SPEED_BANDS,
  BEAUFORT,
  beaufortFromMs,
  sectorIndex,
  pressureTendency,
  mean,
  round,
} from './analytics.util';

export const DAY_MS = 86_400_000;
const CALM_MAX_MS = SPEED_BANDS[0].maxMs; // 0.5 m/s

/** UTC day bounds + ISO date string for the calendar day containing `ts`. */
export function dayBounds(ts: number): { dayStartMs: number; dayEndMs: number; date: string } {
  const dayStartMs = Math.floor(ts / DAY_MS) * DAY_MS;
  return { dayStartMs, dayEndMs: dayStartMs + DAY_MS, date: new Date(dayStartMs).toISOString().slice(0, 10) };
}

/** Median gap between consecutive (sorted) timestamps, or null if < 2 points. */
export function inferCadenceMs(sortedTs: number[]): number | null {
  if (sortedTs.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sortedTs.length; i++) {
    const g = sortedTs[i] - sortedTs[i - 1];
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/**
 * Expected sample count + completeness for a day, inferring cadence from the data.
 * Expected spans the full day for a past day, or up to `nowMs` for the current day.
 */
export function completeness(
  sortedTs: number[],
  dayStartMs: number,
  dayEndMs: number,
  nowMs: number,
): { expectedSamples: number; completenessPercent: number } {
  const sampleCount = sortedTs.length;
  const cadence = inferCadenceMs(sortedTs);
  const windowMs = Math.max(0, Math.min(dayEndMs, nowMs) - dayStartMs) || DAY_MS;
  if (!cadence) {
    // Can't infer a rate → treat the samples we have as all there is.
    return { expectedSamples: Math.max(1, sampleCount), completenessPercent: sampleCount ? 100 : 0 };
  }
  const expectedSamples = Math.max(1, Math.round(windowMs / cadence));
  const completenessPercent = round(Math.min(100, (sampleCount / expectedSamples) * 100), 1) ?? 0;
  return { expectedSamples, completenessPercent };
}

type Num = number | null | undefined;
interface MetRow {
  timestampMs: number;
  windSpeedMs?: Num;
  windDirTrueDeg?: Num;
  windDirRelDeg?: Num;
  tempC?: Num;
  humidityPct?: Num;
  pressureHpa?: Num;
  precipMm?: Num;
  precipRateMmHr?: Num;
  solarWm2?: Num;
  dewPointC?: Num;
}

interface MinMaxAt {
  avg: number | null;
  max: number | null;
  min: number | null;
  maxAt: number | null;
  minAt: number | null;
}

/** avg/min/max (+ the timestamps of the extremes) over a numeric channel. */
function minMaxAt(rows: MetRow[], key: keyof MetRow): MinMaxAt {
  let sum = 0;
  let n = 0;
  let max: number | null = null;
  let min: number | null = null;
  let maxAt: number | null = null;
  let minAt: number | null = null;
  for (const r of rows) {
    const v = r[key] as Num;
    if (v == null || Number.isNaN(v)) continue;
    sum += v;
    n++;
    if (max == null || v > max) { max = v; maxAt = r.timestampMs; }
    if (min == null || v < min) { min = v; minAt = r.timestampMs; }
  }
  return { avg: n ? round(sum / n, 3) : null, max: round(max, 3), min: round(min, 3), maxAt, minAt };
}

export interface MetDailyComputed {
  windSpeedAvgMs: number | null;
  windSpeedMaxMs: number | null;
  windSpeedMaxAt: number | null;
  windDirPrevailing: number | null;
  windCalmPct: number | null;
  beaufortDistribution: number[];
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  tempMaxAt: number | null;
  tempMinAt: number | null;
  humidityAvgPct: number | null;
  humidityMaxPct: number | null;
  humidityMinPct: number | null;
  pressureAvgHpa: number | null;
  pressureMaxHpa: number | null;
  pressureMinHpa: number | null;
  pressureTendency: string | null;
  pressureTendencyHpaPerHr: number | null;
  precipTotalMm: number | null;
  precipRateMaxMmHr: number | null;
  precipRateAvgMmHr: number | null;
  solarMaxWm2: number | null;
  solarAvgWm2: number | null;
  solarDailyKwhM2: number | null;
  dewPointAvgC: number | null;
  dewPointSpreadAvg: number | null;
  sampleCount: number;
  expectedSamples: number;
  completenessPercent: number;
}

/** Compute a MET daily summary from a day's data rows (must be within the day). */
export function computeMetDaily(rowsIn: MetRow[], dayStartMs: number, dayEndMs: number, nowMs: number): MetDailyComputed {
  const rows = [...rowsIn].sort((a, b) => a.timestampMs - b.timestampMs);
  const wind = minMaxAt(rows, 'windSpeedMs');
  const temp = minMaxAt(rows, 'tempC');
  const humidity = minMaxAt(rows, 'humidityPct');
  const pressure = minMaxAt(rows, 'pressureHpa');

  // Prevailing wind = the 22.5° sector with the most samples; calm % = share below 0.5 m/s.
  const sectorCounts = new Array(16).fill(0);
  const beaufortDistribution = new Array(BEAUFORT.length).fill(0);
  let speedN = 0;
  let calmN = 0;
  for (const r of rows) {
    const spd = r.windSpeedMs;
    if (spd != null && !Number.isNaN(spd)) {
      speedN++;
      if (spd < CALM_MAX_MS) calmN++;
      beaufortDistribution[beaufortFromMs(spd).force]++;
      const dir = (r.windDirTrueDeg ?? r.windDirRelDeg) as Num;
      if (dir != null && !Number.isNaN(dir)) sectorCounts[sectorIndex(dir)]++;
    }
  }
  const maxSector = sectorCounts.reduce((best, c, i) => (c > sectorCounts[best] ? i : best), 0);
  const windDirPrevailing = sectorCounts[maxSector] > 0 ? maxSector * 22.5 : null;
  const windCalmPct = speedN ? round((calmN / speedN) * 100, 1) : null;

  // Pressure tendency: slope first→last over the covered span, normalised to hPa/hr.
  const pRows = rows.filter((r) => r.pressureHpa != null && !Number.isNaN(r.pressureHpa as number));
  let pressureTend: string | null = null;
  let pressureHpaPerHr: number | null = null;
  if (pRows.length >= 2) {
    const first = pRows[0];
    const last = pRows[pRows.length - 1];
    const hrs = (last.timestampMs - first.timestampMs) / 3_600_000;
    if (hrs > 0) {
      const perHr = ((last.pressureHpa as number) - (first.pressureHpa as number)) / hrs;
      pressureHpaPerHr = round(perHr, 2);
      pressureTend = pressureTendency(perHr).tendency;
    }
  }

  // Precip: sum of positive deltas (robust to an accumulator that resets).
  let precipTotal: number | null = null;
  const precipRows = rows.filter((r) => r.precipMm != null && !Number.isNaN(r.precipMm as number));
  if (precipRows.length) {
    let sum = 0;
    for (let i = 1; i < precipRows.length; i++) {
      const d = (precipRows[i].precipMm as number) - (precipRows[i - 1].precipMm as number);
      if (d > 0) sum += d;
    }
    precipTotal = round(sum, 3);
  }
  const rate = minMaxAt(rows, 'precipRateMmHr');

  // Solar: trapezoidal integration of W/m² over time → kWh/m² per day.
  const solar = minMaxAt(rows, 'solarWm2');
  const solarRows = rows.filter((r) => r.solarWm2 != null && !Number.isNaN(r.solarWm2 as number));
  let solarKwh: number | null = null;
  if (solarRows.length >= 2) {
    let wh = 0;
    for (let i = 1; i < solarRows.length; i++) {
      const dtH = (solarRows[i].timestampMs - solarRows[i - 1].timestampMs) / 3_600_000;
      wh += (((solarRows[i].solarWm2 as number) + (solarRows[i - 1].solarWm2 as number)) / 2) * dtH;
    }
    solarKwh = round(wh / 1000, 4);
  }

  // Dew point + spread (temp − dew point; small spread ⇒ fog risk).
  const dewVals: number[] = [];
  const spreadVals: number[] = [];
  for (const r of rows) {
    if (r.dewPointC != null && !Number.isNaN(r.dewPointC as number)) {
      dewVals.push(r.dewPointC as number);
      if (r.tempC != null && !Number.isNaN(r.tempC as number)) spreadVals.push((r.tempC as number) - (r.dewPointC as number));
    }
  }

  const ts = rows.map((r) => r.timestampMs);
  const { expectedSamples, completenessPercent } = completeness(ts, dayStartMs, dayEndMs, nowMs);

  return {
    windSpeedAvgMs: wind.avg,
    windSpeedMaxMs: wind.max,
    windSpeedMaxAt: wind.maxAt,
    windDirPrevailing,
    windCalmPct,
    beaufortDistribution,
    tempAvgC: temp.avg,
    tempMaxC: temp.max,
    tempMinC: temp.min,
    tempMaxAt: temp.maxAt,
    tempMinAt: temp.minAt,
    humidityAvgPct: humidity.avg,
    humidityMaxPct: humidity.max,
    humidityMinPct: humidity.min,
    pressureAvgHpa: pressure.avg,
    pressureMaxHpa: pressure.max,
    pressureMinHpa: pressure.min,
    pressureTendency: pressureTend,
    pressureTendencyHpaPerHr: pressureHpaPerHr,
    precipTotalMm: precipTotal,
    precipRateMaxMmHr: rate.max,
    precipRateAvgMmHr: rate.avg,
    solarMaxWm2: solar.max,
    solarAvgWm2: solar.avg,
    solarDailyKwhM2: solarKwh,
    dewPointAvgC: dewVals.length ? round(mean(dewVals), 3) : null,
    dewPointSpreadAvg: spreadVals.length ? round(mean(spreadVals), 3) : null,
    sampleCount: rows.length,
    expectedSamples,
    completenessPercent,
  };
}
