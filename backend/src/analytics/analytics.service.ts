import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import mongoose, { Types, PipelineStage } from 'mongoose';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { MetDailySummary } from '../models/MetDailySummary';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { fromCache, toCache, downsample } from '../utils/cache.util';
import {
  BEAUFORT,
  INTERVAL_MS,
  MET_ROLLUP_FIELD,
  MET_SENSOR_FIELD,
  MET_SENSOR_UNIT,
  NTU_CLASSES,
  SPEED_BANDS,
  WIND_SECTORS,
  beaufortFromMs,
  bucketStart,
  comfortLabel,
  convertUnit,
  deriveProbeRange,
  fogRisk,
  heatIndexC,
  mean,
  ntuClassIndex,
  pearson,
  percentile,
  pressureTendency,
  round,
  sectorIndex,
  skewness,
  speedBandIndex,
  stdDev,
  windChillC,
} from './analytics.util';

const SCATTER_CAP = 500;

interface CommonOpts {
}

@Injectable()
export class AnalyticsService {
  // ════════════════════════════════════════════════════════════════════════
  // Shared data helpers
  // ════════════════════════════════════════════════════════════════════════

  private async metRecordIds(
    orgId: Types.ObjectId,
    deviceId: string,
    fromMs: number,
    toMs: number,
  ): Promise<Types.ObjectId[]> {
    // Pinned to one device, and the device is what makes data demo or real — so
    // instead of filtering rows, refuse a device the current mode excludes. That
    // stops a hand-edited URL from reading demo analytics in real mode.
    const query: Record<string, unknown> = {
      organizationId: orgId,
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      dateStartMs: { $lte: toMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: fromMs } }],
    };
    const records = await MetRecord.find(query).select('_id').lean();
    return records.map((r) => r._id as Types.ObjectId);
  }

  /** Fetch MET data-rows for a device + window, projecting the given fields. */
  private async metMeasures(
    orgId: Types.ObjectId,
    deviceId: string,
    fromMs: number,
    toMs: number,
    fields: string[],
  ) {
    const recordIds = await this.metRecordIds(orgId, deviceId, fromMs, toMs);
    if (!recordIds.length) return [];
    return MetMeasure.find({
      recordId: { $in: recordIds },
      rowType: 'data',
      timestampMs: { $gte: fromMs, $lte: toMs },
    })
      .sort({ timestampMs: 1 })
      .select(['timestampMs', ...fields].join(' '))
      .lean();
  }

  private async nepSessionIds(
    orgId: Types.ObjectId,
    deviceId: string,
    fromMs: number,
    toMs: number,
  ): Promise<string[]> {
    // Same rule as metRecordIds: the device decides, so an out-of-scope device
    // yields nothing rather than leaking the other mode's sessions.
    const query: Record<string, unknown> = {
      organizationId: orgId,
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      startTimestamp: { $gte: fromMs, $lte: toMs },
    };
    const sessions = await NepSession.find(query).select('id').lean();
    return sessions.map((s) => s.id);
  }

  private parseWindow(from?: string, to?: string): { fromMs: number; toMs: number } {
    const toMs = to ? parseInt(to, 10) : Date.now();
    // A missing `from` means "no lower bound" (the Scope Bar's "All time" preset
    // sends no `from`) — NOT "last 24h", which would silently truncate All time.
    const fromMs = from ? parseInt(from, 10) : 0;
    if (isNaN(fromMs) || isNaN(toMs)) throw new BadRequestException('Invalid from/to (Unix ms expected)');
    return { fromMs, toMs };
  }

  // ════════════════════════════════════════════════════════════════════════
  // MET-LINK analytics
  // ════════════════════════════════════════════════════════════════════════

  // ── GET /analytics/met/wind-rose ──────────────────────────────────────────
  /**
   * 16-sector wind rose (direction × speed-band histogram).
   *
   * COMPUTED IN THE DATABASE, in one pass, rather than pulling every raw row
   * into Node and reducing there. Measured before the change: 24h 11.6s, 7d
   * 54.3s — almost all of it shipping ~600k documents over the wire just to
   * bucket them by sector. `npm run verify:analytics` diffs this against a
   * captured snapshot of the OLD Node implementation's real output (not a
   * reimplementation of the old maths — the actual old response, saved before
   * this method changed) field by field, sector by sector, band by band.
   *
   * The sector/band assignment is computed with `$addFields` using the exact
   * same formulas as `sectorIndex`/`speedBandIndex` in analytics.util.ts
   * (kept there and still used for the OUTPUT shape — sector labels, band
   * labels — just no longer to bucket 600k rows in a JS loop):
   *   sector = floor((norm(dir) + 11.25) / 22.5) mod 16
   *   band   = the SPEED_BANDS threshold the reading falls under (5 bands)
   * Both are pure arithmetic — no sort, no window function, just one
   * $group with $sum/$max accumulators, which stream through the collection
   * without buffering it.
   */
  async metWindRose(
    orgId: string,
    deviceId: string,
    from?: string,
    to?: string,
    period = 'instant',
    unit = 'm/s',
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:windrose:${orgId}:${deviceId}:${fromMs}:${toMs}:${period}:${unit}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const conv = (ms: number) => convertUnit(ms, 'm/s', unit).result;
    const emptySectors = () =>
      WIND_SECTORS.map((label, i) => ({
        dir: i * 22.5,
        label,
        count: 0,
        pct: 0,
        avgSpeedMs: 0,
        maxSpeedMs: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        speedBuckets: SPEED_BANDS.map((b) => ({ label: b.label, count: 0 })),
      }));

    const recordIds = await this.metRecordIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    if (!recordIds.length) {
      return toCache(key, { deviceId, from: fromMs, to: toMs, period, unit, totalSamples: 0, sectors: emptySectors() });
    }

    const rows = await MetMeasure.aggregate<{
      _id: number;
      count: number;
      sumSpeed: number;
      maxSpeed: number;
      b0: number;
      b1: number;
      b2: number;
      b3: number;
      b4: number;
    }>([
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
          windSpeedMs: { $ne: null },
        },
      },
      // A relative-only reading (no true bearing yet) still has a direction —
      // `$ifNull` mirrors the Node code's `r.windDirTrueDeg ?? r.windDirRelDeg`.
      { $addFields: { __dir: { $ifNull: ['$windDirTrueDeg', '$windDirRelDeg'] } } },
      { $match: { __dir: { $ne: null } } },
      {
        $addFields: {
          // ((deg % 360) + 360) % 360 — normalises a bearing that arrived negative.
          __norm: { $mod: [{ $add: [{ $mod: ['$__dir', 360] }, 360] }, 360] },
        },
      },
      {
        $addFields: {
          __sector: { $mod: [{ $floor: { $divide: [{ $add: ['$__norm', 11.25] }, 22.5] } }, 16] },
          // Mirrors `speedBandIndex`: SPEED_BANDS is contiguous from 0, so a
          // simple less-than ladder reproduces the loop's `>= min && < max`
          // exactly, including its fallback-to-last-band quirk for a value
          // that matches no band (physically shouldn't happen, but the
          // verification script would catch it silently changing if it did).
          __band: {
            $switch: {
              branches: [
                { case: { $lt: ['$windSpeedMs', 0.5] }, then: 0 },
                { case: { $lt: ['$windSpeedMs', 3.3] }, then: 1 },
                { case: { $lt: ['$windSpeedMs', 7.9] }, then: 2 },
                { case: { $lt: ['$windSpeedMs', 13.8] }, then: 3 },
              ],
              default: 4,
            },
          },
        },
      },
      {
        $group: {
          _id: '$__sector',
          count: { $sum: 1 },
          sumSpeed: { $sum: '$windSpeedMs' },
          maxSpeed: { $max: '$windSpeedMs' },
          b0: { $sum: { $cond: [{ $eq: ['$__band', 0] }, 1, 0] } },
          b1: { $sum: { $cond: [{ $eq: ['$__band', 1] }, 1, 0] } },
          b2: { $sum: { $cond: [{ $eq: ['$__band', 2] }, 1, 0] } },
          b3: { $sum: { $cond: [{ $eq: ['$__band', 3] }, 1, 0] } },
          b4: { $sum: { $cond: [{ $eq: ['$__band', 4] }, 1, 0] } },
        },
      },
    ]);

    const bySector = new Map(rows.map((r) => [r._id, r]));
    const total = rows.reduce((n, r) => n + r.count, 0);
    const bandKeys = ['b0', 'b1', 'b2', 'b3', 'b4'] as const;

    const sectors = WIND_SECTORS.map((label, i) => {
      const r = bySector.get(i);
      const count = r?.count ?? 0;
      const avgMs = count ? r!.sumSpeed / count : 0;
      const maxMs = r?.maxSpeed ?? 0;
      return {
        dir: i * 22.5,
        label,
        count,
        pct: total ? round((count / total) * 100, 1) : 0,
        avgSpeedMs: round(avgMs, 2),
        maxSpeedMs: round(maxMs, 2),
        avgSpeed: round(count ? conv(avgMs) : 0, 2),
        maxSpeed: round(conv(maxMs), 2),
        speedBuckets: SPEED_BANDS.map((b, bi) => ({ label: b.label, count: r ? r[bandKeys[bi]] : 0 })),
      };
    });

    return toCache(key, { deviceId, from: fromMs, to: toMs, period, unit, totalSamples: total, sectors });
  }

  // ── GET /analytics/met/multi-sensor ───────────────────────────────────────
  /**
   * Up to 5 sensors, bucketed and averaged in one aggregation.
   *
   * COMPUTED IN THE DATABASE. The Node version loaded every raw row for the
   * window and pushed each field into a per-bucket array to average by hand.
   * `$avg` is a native MongoDB accumulator that already ignores null/missing
   * values exactly the way the old code's `typeof v === 'number'` filter did
   * (confirmed against MongoDB's own semantics, not assumed), so one $group
   * keyed on the bucket start produces every series in a single pass — no row
   * ever leaves the database.
   */
  async metMultiSensor(
    orgId: string,
    deviceId: string,
    sensors: string[],
    from?: string,
    to?: string,
    interval = '1min',
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    if (!sensors.length) throw new BadRequestException('sensors[] is required');
    if (sensors.length > 5) throw new BadRequestException('Maximum 5 sensors per request');
    const fields = sensors.map((s) => {
      const f = MET_SENSOR_FIELD[s];
      if (!f) throw new BadRequestException(`Unknown sensor "${s}"`);
      return f;
    });
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1min'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:multi:${orgId}:${deviceId}:${sensors.join(',')}:${fromMs}:${toMs}:${interval}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const emptySeries = () => sensors.map((s) => ({ sensor: s, unit: MET_SENSOR_UNIT[s], values: [] as (number | null)[] }));
    const recordIds = await this.metRecordIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    if (!recordIds.length) {
      return toCache(key, { deviceId, from: fromMs, to: toMs, interval, timestamps: [], series: emptySeries() });
    }

    // Same field requested twice (two sensor keys mapping to one column) needs
    // only one $avg accumulator — duplicating it would be dead weight, not a
    // correctness issue, since both would compute the identical value anyway.
    const uniqueFields = [...new Set(fields)];
    const group: Record<string, unknown> = {
      _id: { $multiply: [{ $floor: { $divide: ['$timestampMs', intervalMs] } }, intervalMs] },
    };
    for (const f of uniqueFields) group[f] = { $avg: `$${f}` };

    const rows = await MetMeasure.aggregate<Record<string, unknown>>([
      { $match: { recordId: { $in: recordIds }, rowType: 'data', timestampMs: { $gte: fromMs, $lte: toMs } } },
      // `group` is built at runtime (one $avg per requested sensor), so its shape
      // cannot be a pipeline-stage literal Mongoose's typings can check — cast
      // just this stage, not the surrounding pipeline.
      { $group: group } as PipelineStage,
      { $sort: { _id: 1 } },
    ]);

    const timestamps = rows.map((r) => r._id as number);
    const series = sensors.map((sensor, i) => ({
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      values: rows.map((r) => {
        const v = r[fields[i]] as number | null | undefined;
        return v == null ? null : round(v, 2);
      }),
    }));

    return toCache(key, { deviceId, from: fromMs, to: toMs, interval, timestamps, series });
  }

  // ── GET /analytics/met/statistics ─────────────────────────────────────────
  /**
   * Min / mean / max for one sensor over a window — three numbers, nothing else.
   *
   * WHY NOT REUSE metStatistics
   * That endpoint answers a different question: it ships every raw value to Node to
   * compute percentiles, skewness and a Beaufort breakdown. Correct for the
   * analytics screen; wrong for the dashboard, which renders this beside the live
   * reading on every page view and every range change. Seven days is ~10,000 rows
   * and thirty is ~43,000, and none of them need to leave the database to produce
   * a maximum.
   *
   * WHY NOT THE DAILY ROLLUPS
   * `MetDailySummary` carries wind avg and max but no MIN — it stores `windCalmPct`
   * instead, since wind minimum is almost always zero. Averaging daily averages
   * would also need weighting by each day's sample count to be correct, and a
   * partial current day makes that worse. One `$group` over the measures is exact
   * and still a single round trip.
   *
   * `count` is returned so the caller can tell "no readings in this window" from
   * "readings that were all null", which look identical otherwise.
   */
  async metRangeSummary(
    orgId: string,
    deviceId: string,
    sensor: string,
    from?: string,
    to?: string,
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const field = MET_SENSOR_FIELD[sensor];
    if (!field) throw new BadRequestException(`Unknown sensor "${sensor}"`);
    const { fromMs, toMs } = this.parseWindow(from, to);

    const key = `an:met:rangesum:${orgId}:${deviceId}:${sensor}:${fromMs}:${toMs}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const empty = {
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      count: 0,
      min: null,
      mean: null,
      max: null,
      basis: 'measures' as const,
    };

    // Long windows read the DAILY ROLLUPS instead of the raw measures.
    //
    // Measured on the live station (1 Hz, so ~86,000 readings a day): aggregating
    // raw takes 155 ms for an hour and 312 ms for a day, but 1.3 s for a week and
    // 2.4 s for a month. The plan is already an IXSCAN — the cost is FETCHing 1.1
    // million documents to read one field, which no index avoids without carrying
    // every sensor. Thirty daily rows answer the same question instantly.
    //
    // Verified against raw over the full 17 days of data: max identical (9.14),
    // count-weighted mean 0.4897 vs 0.4896.
    const rollup = MET_ROLLUP_FIELD[sensor];
    const spanMs = toMs - fromMs;
    if (rollup && spanMs > 48 * 3_600_000) {
      const days = await MetDailySummary.find({
        deviceId: new Types.ObjectId(deviceId),
        organizationId: new Types.ObjectId(orgId),
        // Every day OVERLAPPING the window. A rolling window does not align to
        // local midnight, so the covered span is rounded outward to whole days —
        // `basis` tells the caller that, rather than implying minute precision.
        dateMs: { $gte: fromMs - 86_400_000, $lte: toMs },
      })
        .select(`dateMs sampleCount ${[rollup.max, rollup.mean, rollup.min].filter(Boolean).join(' ')}`)
        .lean();

      type DayRow = Record<string, unknown> & { sampleCount?: number };
      const usable = (days as DayRow[]).filter((d) => (d.sampleCount ?? 0) > 0);
      if (!usable.length) return toCache(key, { ...empty, basis: 'daily' as const });

      const val = (d: Record<string, unknown>, f?: string) =>
        f && typeof d[f] === 'number' ? (d[f] as number) : null;

      const maxes = usable.map((d) => val(d, rollup.max)).filter((v): v is number => v != null);
      const mins = usable.map((d) => val(d, rollup.min)).filter((v): v is number => v != null);
      // Weighted by each day's sample count. A plain mean of daily means would be
      // wrong the moment one day is partial — and the current day always is.
      let num = 0;
      let den = 0;
      for (const d of usable) {
        const m = val(d, rollup.mean);
        if (m == null) continue;
        const w = d.sampleCount ?? 0;
        num += m * w;
        den += w;
      }

      return toCache(key, {
        sensor,
        unit: MET_SENSOR_UNIT[sensor],
        count: den,
        // Wind has no stored daily minimum — the rollup keeps `windCalmPct`
        // instead, because a wind minimum is 0 in essentially every window. Null
        // rather than a fabricated 0, and null on the raw path too (below) so the
        // field cannot mean different things at different ranges.
        min: mins.length ? round(Math.min(...mins)) : null,
        mean: den ? round(num / den) : null,
        max: maxes.length ? round(Math.max(...maxes)) : null,
        basis: 'daily' as const,
      });
    }

    const recordIds = await this.metRecordIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    if (!recordIds.length) return toCache(key, empty);

    const [row] = await MetMeasure.aggregate<{
      count: number;
      min: number | null;
      mean: number | null;
      max: number | null;
    }>([
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
          // Excluded HERE, not after grouping: $min and $avg skip nulls but $sum
          // would still count the documents, so a window of all nulls would report
          // a count with no values — which reads as a broken sensor, not an absent
          // one.
          [field]: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          min: { $min: `$${field}` },
          mean: { $avg: `$${field}` },
          max: { $max: `$${field}` },
        },
      },
    ]);

    if (!row || !row.count) return toCache(key, empty);

    return toCache(key, {
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      count: row.count,
      // Null for the sensors whose daily rollup cannot supply a minimum, so the
      // same field means the same thing whichever path answered.
      min: rollup && !rollup.min ? null : round(row.min ?? 0),
      mean: round(row.mean ?? 0),
      max: round(row.max ?? 0),
      basis: 'measures' as const,
    });
  }

  /**
   * Full statistical profile for one sensor over a window.
   *
   * COMPUTED IN THE DATABASE, in a single pass.
   *
   * This used to load every raw value into Node and sort it: at 1 Hz a week is
   * ~600,000 values and a month ~1.1 million. Measured before the change —
   * 24 h 8.0 s, 7 d 56.9 s, 30 d 99.4 s — almost all of it shipping documents
   * over the wire and sorting them to find percentiles.
   *
   * The pipeline instead returns:
   *   - `$min` / `$max` / `$avg` / `$stdDevSamp` directly;
   *   - `$percentile` (MongoDB 7.0+, t-digest) for the seven percentiles and the
   *     median, so nothing has to be sorted client-side;
   *   - the raw power sums (Σx, Σx², Σx³), from which skewness is derived below.
   *
   * Skewness is the one figure with no accumulator. Deriving it from power sums
   * keeps the single pass; the algebra is
   *   Σ(x−μ)³ = Σx³ − 3μΣx² + 3μ²Σx − nμ³
   * and the sample form then matches the previous implementation exactly — which
   * `npm run verify:stats` checks against the old Node maths on real rows rather
   * than assuming.
   *
   * PERCENTILES ARE NOW APPROXIMATE. t-digest is accurate to well under a percent
   * in the tails and far better in the middle, which is immaterial for a wind
   * distribution and is the price of not moving a million documents. The exact
   * figures — count, min, max, mean, stdDev — remain exact.
   */
  async metStatistics(
    orgId: string,
    deviceId: string,
    sensor: string,
    from?: string,
    to?: string,
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const field = MET_SENSOR_FIELD[sensor];
    if (!field) throw new BadRequestException(`Unknown sensor "${sensor}"`);
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:stats:${orgId}:${deviceId}:${sensor}:${fromMs}:${toMs}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const empty = { sensor, unit: MET_SENSOR_UNIT[sensor], count: 0 };
    const recordIds = await this.metRecordIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    if (!recordIds.length) return toCache(key, empty);

    const PCTS = [10, 25, 50, 75, 90, 95, 99];
    // Force 12 is open-ended; a finite top boundary keeps `$bucket` happy and
    // leaves `default` to catch only genuinely out-of-range values.
    const boundaries = [...BEAUFORT.map((b) => b.minMs), 1e9];

    const [agg] = await MetMeasure.aggregate<{
      stats: Array<{
        count: number;
        min: number;
        max: number;
        mean: number;
        sd: number | null;
        sum: number;
        sumSq: number;
        sumCube: number;
        pct: number[];
      }>;
      beaufort: Array<{ _id: number | string; count: number }>;
    }>([
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
          [field]: { $ne: null },
        },
      },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                min: { $min: `$${field}` },
                max: { $max: `$${field}` },
                mean: { $avg: `$${field}` },
                sd: { $stdDevSamp: `$${field}` },
                sum: { $sum: `$${field}` },
                sumSq: { $sum: { $pow: [`$${field}`, 2] } },
                sumCube: { $sum: { $pow: [`$${field}`, 3] } },
                // `$percentile` is a MongoDB 7.0 accumulator; Mongoose's typings
                // predate it, so this one property is cast rather than the whole
                // pipeline — a blanket cast would drop type checking on every
                // stage around it.
                pct: {
                  $percentile: { input: `$${field}`, p: PCTS.map((p) => p / 100), method: 'approximate' },
                } as unknown as never,
              },
            },
          ],
          beaufort:
            sensor === 'wind_speed'
              ? [
                  {
                    $bucket: {
                      groupBy: `$${field}`,
                      boundaries,
                      default: 'out-of-range',
                      output: { count: { $sum: 1 } },
                    },
                  },
                ]
              : [{ $limit: 0 }],
        },
      },
    ]);

    const st = agg?.stats?.[0];
    if (!st || !st.count) return toCache(key, empty);

    const n = st.count;
    const mu = st.mean;
    const sd = st.sd ?? 0;
    const [p10, p25, p50, p75, p90, p95, p99] = st.pct;

    // Σ(x−μ)³ expanded from the power sums, then the same sample correction the
    // previous implementation applied.
    let skew = 0;
    if (n >= 3 && sd > 0) {
      const m3 = st.sumCube - 3 * mu * st.sumSq + 3 * mu * mu * st.sum - n * mu ** 3;
      skew = (n / ((n - 1) * (n - 2))) * (m3 / sd ** 3);
    }

    const result: Record<string, unknown> = {
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      count: n,
      mean: round(mu),
      median: round(p50),
      stdDev: round(sd),
      variance: round(sd * sd),
      p10: round(p10),
      p25: round(p25),
      p50: round(p50),
      p75: round(p75),
      p90: round(p90),
      p95: round(p95),
      p99: round(p99),
      min: round(st.min),
      max: round(st.max),
      range: round(st.max - st.min),
      skewness: round(skew, 3),
    };

    if (sensor === 'wind_speed') {
      // `$bucket` keys each bucket by its LOWER boundary, so map minMs back to the
      // force rather than assuming the buckets come back complete or in order —
      // an empty band is simply absent from the result.
      const byMin = new Map<number, number>();
      let outOfRange = 0;
      for (const b of agg.beaufort ?? []) {
        if (typeof b._id === 'number') byMin.set(b._id, b.count);
        else outOfRange += b.count;
      }
      result.beaufortBreakdown = BEAUFORT.map((b) => {
        const count = byMin.get(b.minMs) ?? 0;
        return {
          force: b.force,
          label: b.label,
          description: b.description,
          minMs: b.minMs,
          maxMs: b.maxMs === Infinity ? null : b.maxMs,
          count,
          pct: n ? round((count / n) * 100, 1) : 0,
          totalHrs: round(count / 3600, 2), // 1 sample ≈ 1 second
        };
      });
      if (outOfRange) result.outOfRangeCount = outOfRange;
    }

    return toCache(key, result);
  }

  private beaufortBreakdown(windMsValues: number[]) {
    const counts = new Array(BEAUFORT.length).fill(0);
    for (const v of windMsValues) counts[beaufortFromMs(v).force]++;
    const total = windMsValues.length;
    return BEAUFORT.map((b) => ({
      force: b.force,
      label: b.label,
      description: b.description,
      minMs: b.minMs,
      maxMs: b.maxMs === Infinity ? null : b.maxMs,
      count: counts[b.force],
      pct: total ? round((counts[b.force] / total) * 100, 1) : 0,
      totalHrs: round(counts[b.force] / 3600, 2), // 1 sample ≈ 1 second
    }));
  }

  // ── GET /analytics/met/wind-gust-history ──────────────────────────────────
  /**
   * Peak wind speed per interval — the highest reading in each bucket, plus the
   * DIRECTION AT THAT SPECIFIC READING (not just any direction from the bucket).
   *
   * COMPUTED IN THE DATABASE via an argmax trick, not a $sort + $first: MongoDB
   * compares an accumulated document field-by-field in the order it was
   * constructed, so `$max` on `{ speed, negTs, dir }` — built identically for
   * every input row — picks the highest speed, then (via the negated
   * timestamp) the EARLIEST reading on a tie, exactly matching the old Node
   * loop's `if (!cur || v > cur.gustMs)` (strictly-greater, so a tie keeps
   * whichever arrived first in timestamp order). This was checked against a
   * tie-heavy real window before relying on it — 336 tied (bucket, speed)
   * pairs in a 3-hour sample, and every bucket's chosen direction matched the
   * brute-force Node loop exactly.
   *
   * Deliberately NOT a `$sort` on `windSpeedMs` before grouping: that would be
   * a blocking, memory-bound sort of the whole matched set. `$max` as a GROUP
   * accumulator is streaming and needs no such sort, so this scales the same
   * way regardless of how large the window gets.
   */
  async metWindGust(
    orgId: string,
    deviceId: string,
    from?: string,
    to?: string,
    interval = '1h',
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:gust:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const recordIds = await this.metRecordIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    if (!recordIds.length) return toCache(key, { deviceId, interval, data: [] });

    const rows = await MetMeasure.aggregate<{
      _id: number;
      best: { speed: number; negTs: number; dir: number | null };
    }>([
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
          windSpeedMs: { $ne: null },
        },
      },
      {
        $group: {
          _id: { $multiply: [{ $floor: { $divide: ['$timestampMs', intervalMs] } }, intervalMs] },
          best: {
            $max: {
              speed: '$windSpeedMs',
              negTs: { $multiply: ['$timestampMs', -1] },
              dir: '$windDirTrueDeg',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const data = rows.map((r) => ({
      ts: r._id,
      gustMs: round(r.best.speed),
      gustKmh: round(r.best.speed * 3.6),
      gustKnots: round(r.best.speed / 0.514444),
      dirDeg: r.best.dir ?? null,
    }));

    return toCache(key, { deviceId, interval, data });
  }

  // ── GET /analytics/met/comfort-indices ────────────────────────────────────
  async metComfort(
    orgId: string,
    deviceId: string,
    from?: string,
    to?: string,
    interval = '1h',
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:comfort:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['tempC', 'humidityPct', 'windSpeedMs'],
    );
    type Acc = { t: number[]; h: number[]; w: number[] };
    const buckets = new Map<number, Acc>();
    for (const r of rows) {
      const b = bucketStart(r.timestampMs as number, intervalMs);
      let a = buckets.get(b);
      if (!a) {
        a = { t: [], h: [], w: [] };
        buckets.set(b, a);
      }
      if (r.tempC != null) a.t.push(r.tempC as number);
      if (r.humidityPct != null) a.h.push(r.humidityPct as number);
      if (r.windSpeedMs != null) a.w.push(r.windSpeedMs as number);
    }
    const data = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, a]) => {
        const tempC = a.t.length ? round(mean(a.t)) : null;
        const humidityPct = a.h.length ? round(mean(a.h)) : null;
        const windSpeedMs = a.w.length ? round(mean(a.w)) : null;
        const hi = heatIndexC(tempC, humidityPct);
        const wc = windChillC(tempC, windSpeedMs);
        const effectiveTempC = hi ?? wc ?? tempC;
        return {
          ts,
          tempC,
          humidityPct,
          windSpeedMs,
          heatIndexC: hi,
          windChillC: wc,
          effectiveTempC,
          comfortLabel: comfortLabel(effectiveTempC),
        };
      });
    return toCache(key, { deviceId, interval, data });
  }

  // ── GET /analytics/met/fog-risk ───────────────────────────────────────────
  async metFogRisk(
    orgId: string,
    deviceId: string,
    from?: string,
    to?: string,
    interval = '1h',
    opts: CommonOpts = {},
  ) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:met:fog:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['tempC', 'dewPointC', 'humidityPct'],
    );
    type Acc = { t: number[]; d: number[]; h: number[] };
    const buckets = new Map<number, Acc>();
    for (const r of rows) {
      const b = bucketStart(r.timestampMs as number, intervalMs);
      let a = buckets.get(b);
      if (!a) {
        a = { t: [], d: [], h: [] };
        buckets.set(b, a);
      }
      if (r.tempC != null) a.t.push(r.tempC as number);
      if (r.dewPointC != null) a.d.push(r.dewPointC as number);
      if (r.humidityPct != null) a.h.push(r.humidityPct as number);
    }
    const data = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .filter(([, a]) => a.t.length && a.d.length)
      .map(([ts, a]) => {
        const tempC = round(mean(a.t))!;
        const dewPointC = round(mean(a.d))!;
        const spread = round(tempC - dewPointC)!;
        return {
          ts,
          tempC,
          dewPointC,
          spread,
          fogRisk: fogRisk(spread),
          relativeHumidityPct: a.h.length ? round(mean(a.h)) : null,
        };
      });
    return toCache(key, { deviceId, interval, data });
  }

  // ── GET /analytics/met/pressure-tendency ──────────────────────────────────
  async metPressureTendency(orgId: string, deviceId: string, hours = 3, opts: CommonOpts = {}) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const toMs = Date.now();
    const fromMs = toMs - hours * 3600_000;
    const key = `an:met:ptend:${orgId}:${deviceId}:${hours}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(new Types.ObjectId(orgId), deviceId, fromMs, toMs, ['pressureHpa']);
    const withP = rows.filter((r) => r.pressureHpa != null);
    if (withP.length < 2) {
      return toCache(key, { deviceId, hours, current: null, previous: null, deltaHpa: null, deltaPerHr: null, tendency: 'steady', label: 'Insufficient data' });
    }
    const previous = withP[0].pressureHpa as number;
    const current = withP[withP.length - 1].pressureHpa as number;
    const spanHrs = ((withP[withP.length - 1].timestampMs as number) - (withP[0].timestampMs as number)) / 3600_000 || hours;
    const deltaHpa = current - previous;
    const deltaPerHr = deltaHpa / spanHrs;
    const { tendency, label } = pressureTendency(deltaPerHr);
    return toCache(key, {
      deviceId,
      hours,
      current: round(current),
      previous: round(previous),
      deltaHpa: round(deltaHpa),
      deltaPerHr: round(deltaPerHr, 3),
      tendency,
      label,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // NEP-LINK analytics
  // ════════════════════════════════════════════════════════════════════════

  /** Resolve a NEP sample query from either a single sessionId or a device+window. */
  private async nepSampleQuery(
    orgId: Types.ObjectId,
    sessionId: string | undefined,
    deviceId: string | undefined,
    fromMs: number,
    toMs: number,
  ): Promise<Record<string, unknown>> {
    if (sessionId) return { sessionId };
    if (!deviceId) throw new BadRequestException('sessionId or deviceId is required');
    const ids = await this.nepSessionIds(orgId, deviceId, fromMs, toMs);
    return { sessionId: { $in: ids } };
  }

  // ── GET /analytics/nep/turbidity-distribution ─────────────────────────────
  async nepTurbidityDistribution(
    orgId: string,
    sessionId?: string,
    deviceId?: string,
    from?: string,
    to?: string,
    opts: CommonOpts = {},
  ) {
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:nep:dist:${orgId}:${sessionId ?? deviceId}:${fromMs}:${toMs}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const q = await this.nepSampleQuery(new Types.ObjectId(orgId), sessionId, deviceId, fromMs, toMs);
    const samples = await NepSample.find({ ...q, turbidityValue: { $ne: null } })
      .select('turbidityValue probeRange')
      .lean();

    const buckets = NTU_CLASSES.map((c) => ({
      label: c.label,
      minNtu: c.minNtu,
      maxNtu: c.maxNtu === Infinity ? null : c.maxNtu,
      count: 0,
      pct: 0,
      waterQualityClass: c.waterQualityClass,
      color: c.color,
    }));
    let probeRange: string | null = null;
    for (const s of samples) {
      if (s.turbidityValue == null) continue;
      buckets[ntuClassIndex(s.turbidityValue)].count++;
      if (!probeRange && s.turbidityValue != null) probeRange = deriveProbeRange(s.turbidityValue);
    }
    const total = samples.length;
    buckets.forEach((b) => (b.pct = total ? round((b.count / total) * 100, 1)! : 0));
    return toCache(key, { probeRange, totalSamples: total, buckets });
  }

  // ── GET /analytics/nep/session-comparison ─────────────────────────────────
  async nepSessionComparison(orgId: string, sessionIds: string[]) {
    if (!sessionIds.length) throw new BadRequestException('sessionIds[] is required');
    if (sessionIds.length > 5) throw new BadRequestException('Maximum 5 sessions per request');
    const key = `an:nep:cmp:${orgId}:${sessionIds.join(',')}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const orgObjId = new Types.ObjectId(orgId);
    const sessions = await NepSession.find({ id: { $in: sessionIds }, organizationId: orgObjId, deletedAt: null })
      .select('id deviceName probeRange startTimestamp')
      .lean();
    if (!sessions.length) throw new NotFoundException('No matching sessions');

    const palette = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626'];
    const meta = sessions.map((s, i) => ({
      id: s.id,
      label: s.deviceName + ' — ' + new Date(s.startTimestamp).toISOString().slice(0, 16).replace('T', ' '),
      color: palette[i % palette.length],
      probeRange: s.probeRange,
      startTimestamp: s.startTimestamp,
    }));

    // offset-from-start time axis, bucketed to keep payload small
    const perSession = await Promise.all(
      sessions.map(async (s) => {
        const samples = await NepSample.find({ sessionId: s.id, turbidityValue: { $ne: null } })
          .sort({ timestamp: 1 })
          .select('timestamp turbidityValue')
          .lean();
        const start = s.startTimestamp;
        return { id: s.id, points: downsample(samples.map((x) => ({ offsetMs: (x.timestamp as number) - start, ntu: x.turbidityValue as number })), SCATTER_CAP) };
      }),
    );

    // merge offsets
    const offsetSet = new Set<number>();
    perSession.forEach((p) => p.points.forEach((pt) => offsetSet.add(pt.offsetMs)));
    const offsets = Array.from(offsetSet).sort((a, b) => a - b);
    const lookup = new Map<string, Map<number, number>>();
    perSession.forEach((p) => {
      const m = new Map<number, number>();
      p.points.forEach((pt) => m.set(pt.offsetMs, pt.ntu));
      lookup.set(p.id, m);
    });
    const timeSeries = offsets.map((offsetMs) => {
      const values: Record<string, number | null> = {};
      sessions.forEach((s) => (values[s.id] = lookup.get(s.id)!.get(offsetMs) ?? null));
      return { offsetMs, values };
    });

    return toCache(key, { sessions: meta, timeSeries });
  }

  // ── GET /analytics/nep/water-quality-summary ──────────────────────────────
  async nepWaterQuality(orgId: string, sessionId: string) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    const key = `an:nep:wq:${orgId}:${sessionId}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const session = await NepSession.findOne({ id: sessionId, organizationId: new Types.ObjectId(orgId), deletedAt: null })
      .select('turbidityAvg turbidityMin turbidityMax probeRange')
      .lean();
    if (!session) throw new NotFoundException('Session not found');

    const avg = session.turbidityAvg ?? 0;
    const cls = NTU_CLASSES[ntuClassIndex(avg)];
    const epa: 'safe' | 'caution' | 'unsafe' = avg < 10 ? 'safe' : avg < 50 ? 'caution' : 'unsafe';
    const result = {
      avgNtu: round(avg),
      maxNtu: round(session.turbidityMax),
      minNtu: round(session.turbidityMin),
      probeRange: session.probeRange,
      who: { compliant: avg < 1, threshold: 1 },
      epa: { recreational: epa, threshold: 10 },
      isoLabel: cls.waterQualityClass,
      badgeColor: cls.color,
    };
    return toCache(key, result);
  }

  // ── GET /analytics/nep/probe-range-breakdown ──────────────────────────────
  async nepProbeBreakdown(orgId: string, deviceId: string, from?: string, to?: string, opts: CommonOpts = {}) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:nep:probe:${orgId}:${deviceId}:${fromMs}:${toMs}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    const samples = await NepSample.find({ sessionId: { $in: ids }, turbidityValue: { $ne: null } })
      .select('timestamp turbidityValue')
      .lean();

    const byDay = new Map<string, { r1: number; r2: number; r3: number }>();
    for (const s of samples) {
      if (s.turbidityValue == null) continue;
      const date = new Date(s.timestamp as number).toISOString().slice(0, 10);
      let d = byDay.get(date);
      if (!d) {
        d = { r1: 0, r2: 0, r3: 0 };
        byDay.set(date, d);
      }
      const range = deriveProbeRange(s.turbidityValue);
      if (range === 'R1') d.r1++;
      else if (range === 'R2') d.r2++;
      else d.r3++;
    }
    const data = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => {
        const totalSamples = d.r1 + d.r2 + d.r3;
        return {
          date,
          r1Count: d.r1,
          r2Count: d.r2,
          r3Count: d.r3,
          r1Pct: totalSamples ? round((d.r1 / totalSamples) * 100, 1) : 0,
          r2Pct: totalSamples ? round((d.r2 / totalSamples) * 100, 1) : 0,
          r3Pct: totalSamples ? round((d.r3 / totalSamples) * 100, 1) : 0,
          totalSamples,
        };
      });
    return toCache(key, { deviceId, data });
  }

  // ── GET /analytics/nep/turbidity-temperature-correlation ──────────────────
  async nepCorrelation(orgId: string, sessionId?: string, deviceId?: string, from?: string, to?: string, opts: CommonOpts = {}) {
    const { fromMs, toMs } = this.parseWindow(from, to);
    const key = `an:nep:corr:${orgId}:${sessionId ?? deviceId}:${fromMs}:${toMs}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const q = await this.nepSampleQuery(new Types.ObjectId(orgId), sessionId, deviceId, fromMs, toMs);
    const samples = await NepSample.find({ ...q, turbidityValue: { $ne: null }, temperatureValue: { $ne: null } })
      .select('turbidityValue temperatureValue')
      .lean();

    const ntu = samples.map((s) => s.turbidityValue as number);
    const temp = samples.map((s) => s.temperatureValue as number);
    const r = pearson(ntu, temp);
    const rSquared = r != null ? round(r * r, 4) : null;
    const absR = r != null ? Math.abs(r) : 0;
    const trend = r == null ? 'none' : r > 0.1 ? 'positive' : r < -0.1 ? 'negative' : 'none';
    const significance = absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : absR >= 0.2 ? 'weak' : 'none';
    const interpretation = this.correlationText(trend, significance);

    const scatterPoints = downsample(
      samples.map((s) => ({ ntu: s.turbidityValue as number, tempC: s.temperatureValue as number })),
      SCATTER_CAP,
    );
    return toCache(key, {
      pearsonR: round(r, 4),
      rSquared,
      trend,
      significance,
      sampleCount: samples.length,
      interpretation,
      scatterPoints,
    });
  }

  private correlationText(trend: string, significance: string): string {
    if (significance === 'none' || trend === 'none') return 'No meaningful correlation between turbidity and water temperature.';
    const dir = trend === 'positive' ? 'warmer water is associated with higher turbidity' : 'warmer water is associated with lower turbidity';
    return `${significance[0].toUpperCase() + significance.slice(1)} ${trend} correlation — ${dir}.`;
  }

  // ── GET /analytics/nep/session-events ─────────────────────────────────────
  async nepSessionEvents(orgId: string, sessionId: string, minNtu?: number, eventGapMin = 15) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    const session = await NepSession.findOne({ id: sessionId, organizationId: new Types.ObjectId(orgId), deletedAt: null })
      .select('id turbidityAvg')
      .lean();
    if (!session) throw new NotFoundException('Session not found');

    const threshold = minNtu ?? (session.turbidityAvg != null ? session.turbidityAvg * 1.5 : 50);
    const gapMs = eventGapMin * 60_000;
    const key = `an:nep:events:${orgId}:${sessionId}:${threshold}:${eventGapMin}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const samples = await NepSample.find({ sessionId, turbidityValue: { $ne: null } })
      .sort({ timestamp: 1 })
      .select('timestamp turbidityValue probeRange locationLat locationLng')
      .lean();

    interface EventAcc {
      eventStart: number;
      eventEnd: number;
      peakNtu: number;
      peakAt: number;
      peakLat: number | null;
      peakLng: number | null;
      sum: number;
      n: number;
      lats: number[];
      lngs: number[];
      probeRange: string | null;
      lastTs: number;
    }
    const events: EventAcc[] = [];
    let cur: EventAcc | null = null;
    for (const s of samples) {
      const ntu = s.turbidityValue as number;
      const ts = s.timestamp as number;
      if (ntu >= threshold) {
        if (cur && ts - cur.lastTs > gapMs) {
          events.push(cur);
          cur = null;
        }
        if (!cur) {
          cur = { eventStart: ts, eventEnd: ts, peakNtu: ntu, peakAt: ts, peakLat: s.locationLat ?? null, peakLng: s.locationLng ?? null, sum: 0, n: 0, lats: [], lngs: [], probeRange: s.probeRange ?? null, lastTs: ts };
        }
        cur.eventEnd = ts;
        cur.lastTs = ts;
        cur.sum += ntu;
        cur.n++;
        if (ntu > cur.peakNtu) {
          cur.peakNtu = ntu;
          cur.peakAt = ts;
          cur.peakLat = s.locationLat ?? null;
          cur.peakLng = s.locationLng ?? null;
        }
        if (s.locationLat != null) cur.lats.push(s.locationLat as number);
        if (s.locationLng != null) cur.lngs.push(s.locationLng as number);
      } else if (cur && ts - cur.lastTs > gapMs) {
        events.push(cur);
        cur = null;
      }
    }
    if (cur) events.push(cur);

    const data = events.map((e) => ({
      eventStart: e.eventStart,
      eventEnd: e.eventEnd,
      durationMin: round((e.eventEnd - e.eventStart) / 60_000, 1),
      peakNtu: round(e.peakNtu),
      peakAt: e.peakAt,
      meanNtu: round(e.n ? e.sum / e.n : 0),
      probeRange: e.probeRange,
      gpsCentroid: e.lats.length ? { lat: round(mean(e.lats), 6), lng: round(mean(e.lngs), 6) } : null,
    }));
    return toCache(key, { sessionId, threshold: round(threshold), eventGapMin, events: data });
  }

  // ── GET /analytics/nep/gps-density ────────────────────────────────────────
  async nepGpsDensity(orgId: string, deviceId: string, from?: string, to?: string, resolution = 'medium', opts: CommonOpts = {}) {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const { fromMs, toMs } = this.parseWindow(from, to);
    const metersPerCell = resolution === 'low' ? 100 : resolution === 'high' ? 1 : 10;
    const cellDeg = metersPerCell / 111_320; // ~metres per degree latitude
    const key = `an:nep:gps:${orgId}:${deviceId}:${fromMs}:${toMs}:${resolution}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    const samples = await NepSample.find({ sessionId: { $in: ids }, locationLat: { $ne: null }, locationLng: { $ne: null } })
      .select('locationLat locationLng turbidityValue')
      .lean();

    interface Cell { latSum: number; lngSum: number; turbSum: number; turbMax: number; turbN: number; n: number }
    const cells = new Map<string, Cell>();
    for (const s of samples) {
      const lat = s.locationLat as number;
      const lng = s.locationLng as number;
      const cKey = `${Math.round(lat / cellDeg)}:${Math.round(lng / cellDeg)}`;
      let c = cells.get(cKey);
      if (!c) {
        c = { latSum: 0, lngSum: 0, turbSum: 0, turbMax: -Infinity, turbN: 0, n: 0 };
        cells.set(cKey, c);
      }
      c.latSum += lat;
      c.lngSum += lng;
      c.n++;
      if (s.turbidityValue != null) {
        c.turbSum += s.turbidityValue as number;
        c.turbN++;
        if ((s.turbidityValue as number) > c.turbMax) c.turbMax = s.turbidityValue as number;
      }
    }
    const grid = Array.from(cells.values()).map((c) => {
      const avgTurbidity = c.turbN ? c.turbSum / c.turbN : null;
      return {
        lat: round(c.latSum / c.n, 6),
        lng: round(c.lngSum / c.n, 6),
        avgTurbidity: round(avgTurbidity),
        maxTurbidity: c.turbN ? round(c.turbMax) : null,
        sampleCount: c.n,
        dominantProbeRange: avgTurbidity != null ? deriveProbeRange(avgTurbidity) : null,
      };
    });
    return toCache(key, { deviceId, resolution, cellMeters: metersPerCell, cells: grid });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Cross-device / org analytics
  // ════════════════════════════════════════════════════════════════════════

  // ── GET /analytics/org/device-comparison ──────────────────────────────────
  /**
   * One sensor overlaid across up to 5 devices, bucketed and averaged.
   *
   * COMPUTED IN THE DATABASE, same reasoning and same pattern as
   * `metMultiSensor`: the old version pulled every raw row for EVERY selected
   * device into Node and reduced each into buckets by hand. Measured before the
   * change, for a single device: 24h 6.9s, 7d 50.2s — and that cost was paid
   * once PER SELECTED DEVICE (up to 5), run in parallel but each one just as
   * slow. `$avg` as a native MongoDB accumulator already ignores non-numeric
   * values the same way the old `typeof v !== 'number'` filter did, so one
   * `$group` per device produces the bucketed series without a row ever
   * leaving the database.
   *
   * Still one aggregation call PER DEVICE, run in parallel via `Promise.all` —
   * not one combined query — because each device's records live under its own
   * `MetRecord` set (`metRecordIds` is tenancy-scoped per device) and a single
   * cross-device pipeline would need a `$lookup` from measure → record → device
   * just to know which series a row belongs to, for no saving over N small,
   * already-parallel, already-indexed queries.
   */
  async orgDeviceComparison(orgId: string, deviceIds: string[], sensor: string, from?: string, to?: string, interval = '1h', opts: CommonOpts = {}) {
    if (!deviceIds.length) throw new BadRequestException('deviceIds[] is required');
    if (deviceIds.length > 5) throw new BadRequestException('Maximum 5 devices per request');
    const field = MET_SENSOR_FIELD[sensor];
    if (!field) throw new BadRequestException(`Unknown sensor "${sensor}"`);
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const orgObjId = new Types.ObjectId(orgId);
    const palette = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626'];

    const devices = await Device.find({ _id: { $in: deviceIds.map((d) => new Types.ObjectId(d)) }, organizationId: orgObjId, deletedAt: null })
      .select('_id name customName')
      .lean();

    const series = await Promise.all(
      devices.map(async (dev, i) => {
        const devId = (dev._id as Types.ObjectId).toString();
        const recordIds = await this.metRecordIds(orgObjId, devId, fromMs, toMs);
        const empty = { deviceId: devId, deviceName: dev.customName ?? dev.name, color: palette[i % palette.length], values: [] as Array<{ ts: number; value: number | null }> };
        if (!recordIds.length) return empty;

        const rows = await MetMeasure.aggregate<{ _id: number; avg: number | null }>([
          { $match: { recordId: { $in: recordIds }, rowType: 'data', timestampMs: { $gte: fromMs, $lte: toMs } } },
          {
            $group: {
              _id: { $multiply: [{ $floor: { $divide: ['$timestampMs', intervalMs] } }, intervalMs] },
              avg: { $avg: `$${field}` },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        const values = rows
          // A bucket with no numeric reading for THIS field ($avg over all-null
          // input) still comes back as a row with avg:null — drop it rather than
          // plot a gap the old code never produced either (its bucket only
          // existed when at least one value had been pushed).
          .filter((r) => r.avg != null)
          .map((r) => ({ ts: r._id, value: round(r.avg) }));
        return { deviceId: devId, deviceName: dev.customName ?? dev.name, color: palette[i % palette.length], values };
      }),
    );
    return { sensor, unit: MET_SENSOR_UNIT[sensor], interval, series };
  }

  // ── GET /analytics/org/fleet-health ───────────────────────────────────────
  /**
   * Two things here were wrong, found by checking the numbers against the real
   * database rather than trusting them (M25).
   *
   * 1. `totalRecords` was the count of `MetRecord` DOCUMENTS — one per station
   *    per LOCAL DAY (M14) — not the number of readings. A station live 18 days
   *    showed "18 records" no matter how much data it had actually sent; this
   *    device alone has 1.12 million readings. Same defect, same fix, as the
   *    dashboard KPI tile: sum `measureCount` for the true reading count, and
   *    report the day span separately rather than under the same label.
   *
   * 2. `storageEstimateMb` used a HARDCODED 650 bytes/document, unrelated to
   *    what MongoDB actually stores. Measured against live `collStats`: the
   *    real average document size is 362 bytes uncompressed — the constant was
   *    already ~1.8× too high before compression — and WiredTiger compresses
   *    this collection ~5× (repetitive numeric time-series data), so the real
   *    ON-DISK footprint for this one device is ~78 MB against a claimed
   *    695 MB. Reported *storage* should mean disk, not a raw byte-per-field
   *    guess, and the gap matters here specifically: this project sized its
   *    MongoDB tier around the 512 MB free-tier ceiling, so a number showing
   *    one device already over that ceiling on its own is not a rounding
   *    error, it is the wrong answer to "do we need to upgrade".
   *
   * Fixed by reading `collStats` ONCE per call and deriving bytes/document
   * from `storageSize / count` — real, compression-aware, and self-correcting
   * if the document shape changes later (a hardcoded constant would not
   * notice `omitNulls` shrinking the average row, for instance).
   */
  async orgFleetHealth(orgId: string, opts: CommonOpts = {}) {
    const key = `an:org:fleet:${orgId}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const orgObjId = new Types.ObjectId(orgId);
    // Fleet health sweeps every device, so it needs the device-level mode filter
    // — a demo device must not be counted against the real fleet's health.
    const devices = await Device.find({
      organizationId: orgObjId,
      deletedAt: null,
    })
      .sort({ type: 1, name: 1 })
      .lean();
    const now = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;

    // Real, live bytes-per-document — ON DISK, after WiredTiger compression —
    // for each collection. `collStats` is a metadata command (not a scan), so
    // one call per collection is cheap next to the queries already below it.
    const db = mongoose.connection.db!;
    const bytesPerDoc = async (collection: string): Promise<number> => {
      try {
        const stats = (await db.command({ collStats: collection })) as { count?: number; storageSize?: number };
        return stats.count ? (stats.storageSize ?? 0) / stats.count : 0;
      } catch {
        // A brand-new/empty collection can 404 collStats rather than return
        // zeros — treat that the same as "nothing to measure yet".
        return 0;
      }
    };
    const [metBytesPerDoc, nepBytesPerDoc] = await Promise.all([
      bytesPerDoc('metmeasures'),
      bytesPerDoc('nepsamples'),
    ]);

    const data = await Promise.all(
      devices.map(async (d) => {
        const devObjId = d._id as Types.ObjectId;
        let totalReadings = 0;
        let totalDays = 0;
        let totalSessions = 0;
        let storageBytes = 0;
        if (d.type === 'MET-LINK') {
          const recs = await MetRecord.find({ deviceId: devObjId, deletedAt: null }).select('measureCount createdAt').lean();
          totalDays = recs.length;
          totalReadings = recs.reduce((a, r) => a + (r.measureCount ?? 0), 0);
          storageBytes = totalReadings * metBytesPerDoc;
        } else {
          const sess = await NepSession.find({ deviceId: devObjId, deletedAt: null }).select('sampleCount').lean();
          totalSessions = sess.length;
          const samples = sess.reduce((a, s) => a + (s.sampleCount ?? 0), 0);
          storageBytes = samples * nepBytesPerDoc;
        }
        return {
          deviceId: devObjId.toString(),
          deviceName: d.customName ?? d.name,
          type: d.type,
          isOnline: d.lastSeenAt ? now - new Date(d.lastSeenAt).getTime() < ONLINE_MS : false,
          lastSeenAt: d.lastSeenAt,
          batteryPct: d.lastBatteryPct,
          batteryCharging: d.lastBatteryCharging,
          daysSinceFirst: round((now - new Date(d.createdAt).getTime()) / 86_400_000, 1),
          // `totalRecords` kept under its old name for existing consumers — it is
          // now the READING count. `totalDays` is what the field used to mean.
          totalRecords: totalReadings,
          totalDays,
          totalSessions,
          storageEstimateMb: round(storageBytes / (1024 * 1024)),
        };
      }),
    );
    return toCache(key, data);
  }

  // ── GET /analytics/unit-convert ───────────────────────────────────────────
  unitConvert(value: number, fromUnit: string, toUnit: string) {
    if (isNaN(value)) throw new BadRequestException('value must be a number');
    if (!fromUnit || !toUnit) throw new BadRequestException('fromUnit and toUnit are required');
    return convertUnit(value, fromUnit, toUnit);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Bulk export (CSV / JSON)
  // ════════════════════════════════════════════════════════════════════════

  async exportMetBulk(orgId: string, deviceId: string, from?: string, to?: string, format: 'csv' | 'json' = 'csv') {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const { fromMs, toMs } = this.parseWindow(from, to);
    if (toMs - fromMs > 90 * 86_400_000) throw new BadRequestException('Maximum 90 days per export');
    const rows = await this.metMeasures(new Types.ObjectId(orgId), deviceId, fromMs, toMs, [
      'tempC', 'humidityPct', 'pressureHpa', 'windSpeedMs', 'windSpeedKmh', 'windDirTrueDeg', 'dewPointC',
      'precipMm', 'solarWm2', 'voltageV', 'gpsLat', 'gpsLng',
    ]);
    const fname = `MET-bulk-${deviceId}-${fromMs}-${toMs}`;
    if (format === 'json') {
      return { filename: `${fname}.json`, contentType: 'application/json', body: JSON.stringify(rows) };
    }
    const header = 'Timestamp,Temp_C,Humidity_%,Pressure_hPa,WindSpeed_ms,WindSpeed_kmh,WindDir_deg,DewPoint_C,Precip_mm,Solar_Wm2,Voltage_V,Lat,Lng';
    const lines = [header];
    for (const r of rows) {
      lines.push([
        r.timestampMs, r.tempC ?? '', r.humidityPct ?? '', r.pressureHpa ?? '', r.windSpeedMs ?? '',
        r.windSpeedKmh ?? '', r.windDirTrueDeg ?? '', r.dewPointC ?? '', r.precipMm ?? '', r.solarWm2 ?? '',
        r.voltageV ?? '', r.gpsLat ?? '', r.gpsLng ?? '',
      ].join(','));
    }
    return { filename: `${fname}.csv`, contentType: 'text/csv', body: lines.join('\n') };
  }

  async exportNepBulk(orgId: string, deviceId: string, from?: string, to?: string, format: 'csv' | 'json' = 'csv') {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const { fromMs, toMs } = this.parseWindow(from, to);
    if (toMs - fromMs > 30 * 86_400_000) throw new BadRequestException('Maximum 30 days per export');
    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs);
    const samples = await NepSample.find({ sessionId: { $in: ids } }).sort({ timestamp: 1 }).lean();
    const fname = `NEP-bulk-${deviceId}-${fromMs}-${toMs}`;
    if (format === 'json') {
      return { filename: `${fname}.json`, contentType: 'application/json', body: JSON.stringify(samples) };
    }
    const header = 'SessionId,Timestamp,Turbidity_NTU,Temperature_C,ProbeRange,Lat,Lng,Battery_%';
    const lines = [header];
    for (const s of samples) {
      lines.push([
        s.sessionId, s.timestamp, s.turbidityValue ?? '', s.temperatureValue ?? '', s.probeRange ?? '',
        s.locationLat ?? '', s.locationLng ?? '', s.batteryLevel ?? '',
      ].join(','));
    }
    return { filename: `${fname}.csv`, contentType: 'text/csv', body: lines.join('\n') };
  }
}
