import { Types } from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { MetDailyComputed, computeMetDaily, DAY_MS } from './daily-summary.util';

/**
 * MET daily rollup, computed inside MongoDB.
 *
 * WHY
 * The original path loaded every row of the day into Node. Measured on a real
 * 1 Hz day (86,400 rows) that took **9.5 seconds** — and the cost is per-document
 * round-tripping, not payload size: fetching timestamps alone still took 6.5s.
 * At one recompute per agent POST that is four hours of CPU per station per day.
 *
 * A `$group` returning ONE document does the same arithmetic in ~220ms.
 *
 * WHAT STAYS IN NODE
 * Three parts genuinely need ordered rows:
 *   - pressure tendency  → only the FIRST and LAST non-null pressure (2 rows)
 *   - precipitation total → positive deltas over the ordered series
 *   - solar kWh          → trapezoidal integration over the ordered series
 * Each is fetched only when that sensor reported at all, so a wind-only station
 * fetches nothing. When a sensor IS present the series is still far smaller than
 * the full day, and the original `computeMetDaily` does the arithmetic so the
 * subtle bits are not reimplemented.
 *
 * Verified row-for-row against the original implementation on real ingested data
 * in test/daily-summary-agg.e2e-spec.ts.
 */

const SECTORS = 16;
const SECTOR_WIDTH = 360 / SECTORS;
const CALM_MAX_MS = 0.5;
/** Beaufort force lower bounds in m/s, force 0..12. */
const BEAUFORT_BOUNDS = [0, 0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, Infinity];

interface GroupStats {
  sampleCount: number;
  windSum: number; windN: number; windMax: number | null; calmN: number;
  tempSum: number; tempN: number; tempMax: number | null; tempMin: number | null;
  humSum: number; humN: number; humMax: number | null; humMin: number | null;
  presSum: number; presN: number; presMax: number | null; presMin: number | null;
  rateSum: number; rateN: number; rateMax: number | null;
  solarSum: number; solarN: number; solarMax: number | null;
  dewSum: number; dewN: number; spreadSum: number; spreadN: number;
  hasPressure: number; hasPrecip: number; hasSolar: number;
}

const round = (v: number | null, dp: number): number | null =>
  v === null || Number.isNaN(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp;

const avg = (sum: number, n: number, dp = 3): number | null => (n ? round(sum / n, dp) : null);

export async function computeMetDailyAggregated(
  recordIds: Types.ObjectId[],
  dayStartMs: number,
  dayEndMs: number,
  nowMs: number,
): Promise<MetDailyComputed | null> {
  if (recordIds.length === 0) return null;

  const match = { recordId: { $in: recordIds }, rowType: 'data', timestampMs: { $gte: dayStartMs, $lt: dayEndMs } };

  // NOT a $facet.
  //
  // `$facet` sub-pipelines cannot use indexes — only the pipeline's leading
  // `$match` does. That made the `$setWindowFields` sort below a blocking
  // in-memory sort of the whole day, which fails outright at 86,400 rows:
  //   "Sort exceeded memory limit of 33554432 bytes".
  //
  // Run as separate aggregations each one can use { recordId, timestampMs },
  // which is both correct and faster than the facet would have been.
  const [statsDoc] = await MetMeasure.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        sampleCount: { $sum: 1 },
        windSum: { $sum: { $ifNull: ['$windSpeedMs', 0] } },
        windN: { $sum: { $cond: [{ $ne: ['$windSpeedMs', null] }, 1, 0] } },
        windMax: { $max: '$windSpeedMs' },
        calmN: { $sum: { $cond: [{ $and: [{ $ne: ['$windSpeedMs', null] }, { $lt: ['$windSpeedMs', CALM_MAX_MS] }] }, 1, 0] } },
        tempSum: { $sum: { $ifNull: ['$tempC', 0] } },
        tempN: { $sum: { $cond: [{ $ne: ['$tempC', null] }, 1, 0] } },
        tempMax: { $max: '$tempC' }, tempMin: { $min: '$tempC' },
        humSum: { $sum: { $ifNull: ['$humidityPct', 0] } },
        humN: { $sum: { $cond: [{ $ne: ['$humidityPct', null] }, 1, 0] } },
        humMax: { $max: '$humidityPct' }, humMin: { $min: '$humidityPct' },
        presSum: { $sum: { $ifNull: ['$pressureHpa', 0] } },
        presN: { $sum: { $cond: [{ $ne: ['$pressureHpa', null] }, 1, 0] } },
        presMax: { $max: '$pressureHpa' }, presMin: { $min: '$pressureHpa' },
        rateSum: { $sum: { $ifNull: ['$precipRateMmHr', 0] } },
        rateN: { $sum: { $cond: [{ $ne: ['$precipRateMmHr', null] }, 1, 0] } },
        rateMax: { $max: '$precipRateMmHr' },
        solarSum: { $sum: { $ifNull: ['$solarWm2', 0] } },
        solarN: { $sum: { $cond: [{ $ne: ['$solarWm2', null] }, 1, 0] } },
        solarMax: { $max: '$solarWm2' },
        dewSum: { $sum: { $ifNull: ['$dewPointC', 0] } },
        dewN: { $sum: { $cond: [{ $ne: ['$dewPointC', null] }, 1, 0] } },
        spreadSum: { $sum: { $cond: [{ $and: [{ $ne: ['$dewPointC', null] }, { $ne: ['$tempC', null] }] }, { $subtract: ['$tempC', '$dewPointC'] }, 0] } },
        spreadN: { $sum: { $cond: [{ $and: [{ $ne: ['$dewPointC', null] }, { $ne: ['$tempC', null] }] }, 1, 0] } },
        hasPressure: { $sum: { $cond: [{ $ne: ['$pressureHpa', null] }, 1, 0] } },
        hasPrecip: { $sum: { $cond: [{ $ne: ['$precipMm', null] }, 1, 0] } },
        hasSolar: { $sum: { $cond: [{ $ne: ['$solarWm2', null] }, 1, 0] } },
      },
    },
  ]);

  // Direction sectors. Only rows that HAVE a speed count — a bearing with no
  // speed is not a wind observation, matching the original.
  const sectorDocs = await MetMeasure.aggregate<{ _id: number; n: number }>([
    { $match: { ...match, windSpeedMs: { $ne: null } } },
    { $project: { d: { $ifNull: ['$windDirTrueDeg', '$windDirRelDeg'] } } },
    { $match: { d: { $ne: null } } },
    { $group: { _id: { $mod: [{ $round: [{ $divide: ['$d', SECTOR_WIDTH] }, 0] }, SECTORS] }, n: { $sum: 1 } } },
  ]);

  const beaufortDocs = await MetMeasure.aggregate<{ _id: number | string; n: number }>([
    { $match: { ...match, windSpeedMs: { $ne: null } } },
    {
      $bucket: {
        groupBy: '$windSpeedMs',
        boundaries: BEAUFORT_BOUNDS,
        default: 'other',
        output: { n: { $sum: 1 } },
      },
    },
  ]);

  // Median inter-sample gap. Server-side because fetching 86,400 timestamps to
  // compute it in Node costs 6.5 seconds.
  const cadenceDocs = await MetMeasure.aggregate([
    { $match: match },
    { $setWindowFields: { sortBy: { timestampMs: 1 }, output: { prevTs: { $shift: { output: '$timestampMs', by: -1, default: null } } } } },
    { $project: { gap: { $cond: [{ $eq: ['$prevTs', null] }, null, { $subtract: ['$timestampMs', '$prevTs'] }] } } },
    { $match: { gap: { $gt: 0 } } },
    { $group: { _id: null, median: { $percentile: { input: '$gap', p: [0.5], method: 'approximate' } } } },
  ] as never);

  // Extrema timestamps. `.limit(1)` makes these bounded top-k sorts, not
  // blocking ones. Ties resolve to the EARLIEST row, matching the original's
  // strict `>` / `<` comparison.
  const argAt = async (field: 'windSpeedMs' | 'tempC', dir: 1 | -1): Promise<number | null> => {
    const [doc] = await MetMeasure.find({ ...match, [field]: { $ne: null } })
      .sort({ [field]: dir, timestampMs: 1 })
      .limit(1)
      .select('timestampMs -_id')
      .lean();
    return doc?.timestampMs ?? null;
  };

  const stats = (statsDoc ?? null) as GroupStats | null;
  if (!stats || stats.sampleCount === 0) return null;

  // ── Sequential parts: fetch only the series that actually exist ───────────
  type SeqRow = { timestampMs: number } & Record<string, unknown>;
  const pull = async (field: 'pressureHpa' | 'precipMm' | 'solarWm2', limitToEnds: boolean): Promise<SeqRow[]> => {
    const q = { ...match, [field]: { $ne: null } };
    if (limitToEnds) {
      const [first] = await MetMeasure.find(q).sort({ timestampMs: 1 }).limit(1).select(`timestampMs ${field}`).lean();
      const [last] = await MetMeasure.find(q).sort({ timestampMs: -1 }).limit(1).select(`timestampMs ${field}`).lean();
      return [first, last].filter(Boolean) as unknown as SeqRow[];
    }
    return (await MetMeasure.find(q).sort({ timestampMs: 1 }).select(`timestampMs ${field}`).lean()) as unknown as SeqRow[];
  };

  const pressureRows = stats.hasPressure ? await pull('pressureHpa', true) : [];
  const precipRows = stats.hasPrecip ? await pull('precipMm', false) : [];
  const solarRows = stats.hasSolar ? await pull('solarWm2', false) : [];

  // Delegate the awkward arithmetic to the original implementation, handing it
  // ONLY the rows those calculations need. Everything it derives from other
  // fields is discarded below — this call is for pressure/precip/solar alone.
  const sequential = computeMetDaily(
    [...pressureRows, ...precipRows, ...solarRows].sort((a, b) => a.timestampMs - b.timestampMs) as never,
    dayStartMs,
    dayEndMs,
    nowMs,
  );

  // ── Sectors and Beaufort ─────────────────────────────────────────────────
  const sectorCounts: number[] = new Array(SECTORS).fill(0);
  for (const d of sectorDocs) sectorCounts[d._id] = d.n;
  const maxSector = sectorCounts.reduce((best, c, i) => (c > sectorCounts[best] ? i : best), 0);
  const windDirPrevailing = sectorCounts[maxSector] > 0 ? maxSector * SECTOR_WIDTH : null;

  const beaufortDistribution: number[] = new Array(13).fill(0);
  for (const b of beaufortDocs) {
    const idx = BEAUFORT_BOUNDS.indexOf(b._id as number);
    if (idx >= 0) beaufortDistribution[idx] = b.n;
  }

  // ── Completeness ─────────────────────────────────────────────────────────
  const cadence = (cadenceDocs[0]?.median?.[0] as number | undefined) ?? null;
  const windowMs = Math.max(0, Math.min(dayEndMs, nowMs) - dayStartMs) || DAY_MS;
  let expectedSamples: number;
  let completenessPercent: number;
  if (!cadence) {
    expectedSamples = Math.max(1, stats.sampleCount);
    completenessPercent = stats.sampleCount ? 100 : 0;
  } else {
    expectedSamples = Math.max(1, Math.round(windowMs / cadence));
    completenessPercent = round(Math.min(100, (stats.sampleCount / expectedSamples) * 100), 1) ?? 0;
  }

  return {
    windSpeedAvgMs: avg(stats.windSum, stats.windN),
    windSpeedMaxMs: round(stats.windMax, 3),
    windSpeedMaxAt: await argAt('windSpeedMs', -1),
    windDirPrevailing,
    windCalmPct: stats.windN ? round((stats.calmN / stats.windN) * 100, 1) : null,
    beaufortDistribution,
    tempAvgC: avg(stats.tempSum, stats.tempN),
    tempMaxC: round(stats.tempMax, 3),
    tempMinC: round(stats.tempMin, 3),
    tempMaxAt: stats.tempN ? await argAt('tempC', -1) : null,
    tempMinAt: stats.tempN ? await argAt('tempC', 1) : null,
    humidityAvgPct: avg(stats.humSum, stats.humN),
    humidityMaxPct: round(stats.humMax, 3),
    humidityMinPct: round(stats.humMin, 3),
    pressureAvgHpa: avg(stats.presSum, stats.presN),
    pressureMaxHpa: round(stats.presMax, 3),
    pressureMinHpa: round(stats.presMin, 3),
    pressureTendency: sequential.pressureTendency,
    pressureTendencyHpaPerHr: sequential.pressureTendencyHpaPerHr,
    precipTotalMm: sequential.precipTotalMm,
    precipRateMaxMmHr: round(stats.rateMax, 3),
    precipRateAvgMmHr: avg(stats.rateSum, stats.rateN),
    solarMaxWm2: round(stats.solarMax, 3),
    solarAvgWm2: avg(stats.solarSum, stats.solarN),
    solarDailyKwhM2: sequential.solarDailyKwhM2,
    dewPointAvgC: avg(stats.dewSum, stats.dewN),
    dewPointSpreadAvg: avg(stats.spreadSum, stats.spreadN),
    sampleCount: stats.sampleCount,
    expectedSamples,
    completenessPercent,
  };
}
