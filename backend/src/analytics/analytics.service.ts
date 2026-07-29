import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { NepSession } from '../models/NepSession';
import { isDeviceInScope, demoDeviceSelfFilter } from '../utils/demo-scope.util';
import { NepSample } from '../models/NepSample';
import { fromCache, toCache, downsample } from '../utils/cache.util';
import {
  MET_SENSOR_FIELD,
  MET_SENSOR_UNIT,
  WIND_SECTORS,
  sectorIndex,
  SPEED_BANDS,
  speedBandIndex,
  BEAUFORT,
  beaufortFromMs,
  heatIndexC,
  windChillC,
  comfortLabel,
  fogRisk,
  pressureTendency,
  NTU_CLASSES,
  ntuClassIndex,
  deriveProbeRange,
  mean,
  percentile,
  stdDev,
  skewness,
  round,
  pearson,
  INTERVAL_MS,
  bucketStart,
  convertUnit,
} from './analytics.util';

const SCATTER_CAP = 500;

interface CommonOpts {
  demoOnly?: boolean;
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
    demoOnly: boolean,
  ): Promise<Types.ObjectId[]> {
    // Pinned to one device, and the device is what makes data demo or real — so
    // instead of filtering rows, refuse a device the current mode excludes. That
    // stops a hand-edited URL from reading demo analytics in real mode.
    if (!(await isDeviceInScope(orgId, deviceId, demoOnly))) return [];
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
    demoOnly: boolean,
  ) {
    const recordIds = await this.metRecordIds(orgId, deviceId, fromMs, toMs, demoOnly);
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
    demoOnly: boolean,
  ): Promise<string[]> {
    // Same rule as metRecordIds: the device decides, so an out-of-scope device
    // yields nothing rather than leaking the other mode's sessions.
    if (!(await isDeviceInScope(orgId, deviceId, demoOnly))) return [];
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:windrose:${orgId}:${deviceId}:${fromMs}:${toMs}:${period}:${unit}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['windSpeedMs', 'windDirTrueDeg', 'windDirRelDeg'],
      demoOnly,
    );

    const sectors = WIND_SECTORS.map((label, i) => ({
      dir: i * 22.5,
      label,
      count: 0,
      pct: 0,
      avgSpeedMs: 0,
      maxSpeedMs: 0,
      speedBuckets: SPEED_BANDS.map((b) => ({ label: b.label, count: 0 })),
      _sum: 0,
    }));

    let total = 0;
    for (const r of rows) {
      const dir = r.windDirTrueDeg ?? r.windDirRelDeg;
      const spd = r.windSpeedMs;
      if (dir == null || spd == null) continue;
      const si = sectorIndex(dir);
      const s = sectors[si];
      s.count++;
      s._sum += spd;
      if (spd > s.maxSpeedMs) s.maxSpeedMs = spd;
      s.speedBuckets[speedBandIndex(spd)].count++;
      total++;
    }

    const conv = (ms: number) => convertUnit(ms, 'm/s', unit).result;
    const result = {
      deviceId,
      from: fromMs,
      to: toMs,
      period,
      unit,
      totalSamples: total,
      sectors: sectors.map((s) => ({
        dir: s.dir,
        label: s.label,
        count: s.count,
        pct: total ? round((s.count / total) * 100, 1) : 0,
        avgSpeedMs: round(s.count ? s._sum / s.count : 0, 2),
        maxSpeedMs: round(s.maxSpeedMs, 2),
        avgSpeed: round(s.count ? conv(s._sum / s.count) : 0, 2),
        maxSpeed: round(conv(s.maxSpeedMs), 2),
        speedBuckets: s.speedBuckets,
      })),
    };
    return toCache(key, result);
  }

  // ── GET /analytics/met/multi-sensor ───────────────────────────────────────
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:multi:${orgId}:${deviceId}:${sensors.join(',')}:${fromMs}:${toMs}:${interval}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(new Types.ObjectId(orgId), deviceId, fromMs, toMs, fields, demoOnly);

    // bucket → field → values[]
    const buckets = new Map<number, Record<string, number[]>>();
    for (const r of rows) {
      const b = bucketStart(r.timestampMs as number, intervalMs);
      let entry = buckets.get(b);
      if (!entry) {
        entry = {};
        fields.forEach((f) => (entry![f] = []));
        buckets.set(b, entry);
      }
      for (const f of fields) {
        const v = (r as Record<string, unknown>)[f];
        if (typeof v === 'number') entry[f].push(v);
      }
    }
    const timestamps = Array.from(buckets.keys()).sort((a, b) => a - b);
    const series = sensors.map((sensor, i) => ({
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      values: timestamps.map((t) => {
        const arr = buckets.get(t)![fields[i]];
        return arr.length ? round(mean(arr), 2) : null;
      }),
    }));

    return toCache(key, { deviceId, from: fromMs, to: toMs, interval, timestamps, series });
  }

  // ── GET /analytics/met/statistics ─────────────────────────────────────────
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:stats:${orgId}:${deviceId}:${sensor}:${fromMs}:${toMs}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(new Types.ObjectId(orgId), deviceId, fromMs, toMs, [field], demoOnly);
    const values = rows
      .map((r) => (r as Record<string, unknown>)[field])
      .filter((v): v is number => typeof v === 'number');

    if (!values.length) {
      return toCache(key, { sensor, unit: MET_SENSOR_UNIT[sensor], count: 0 });
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mu = mean(values);
    const sd = stdDev(values, mu);
    const result: Record<string, unknown> = {
      sensor,
      unit: MET_SENSOR_UNIT[sensor],
      count: values.length,
      mean: round(mu),
      median: round(percentile(sorted, 50)),
      stdDev: round(sd),
      variance: round(sd * sd),
      p10: round(percentile(sorted, 10)),
      p25: round(percentile(sorted, 25)),
      p50: round(percentile(sorted, 50)),
      p75: round(percentile(sorted, 75)),
      p90: round(percentile(sorted, 90)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      min: round(sorted[0]),
      max: round(sorted[sorted.length - 1]),
      range: round(sorted[sorted.length - 1] - sorted[0]),
      skewness: round(skewness(values), 3),
    };
    if (sensor === 'wind_speed') {
      result.beaufortBreakdown = this.beaufortBreakdown(values);
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:gust:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['windSpeedMs', 'windDirTrueDeg'],
      demoOnly,
    );
    const buckets = new Map<number, { gustMs: number; dirDeg: number | null }>();
    for (const r of rows) {
      if (r.windSpeedMs == null) continue;
      const b = bucketStart(r.timestampMs as number, intervalMs);
      const cur = buckets.get(b);
      if (!cur || (r.windSpeedMs as number) > cur.gustMs) {
        buckets.set(b, { gustMs: r.windSpeedMs as number, dirDeg: r.windDirTrueDeg ?? null });
      }
    }
    const data = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, g]) => ({
        ts,
        gustMs: round(g.gustMs),
        gustKmh: round(g.gustMs * 3.6),
        gustKnots: round(g.gustMs / 0.514444),
        dirDeg: g.dirDeg,
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:comfort:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['tempC', 'humidityPct', 'windSpeedMs'],
      demoOnly,
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:met:fog:${orgId}:${deviceId}:${fromMs}:${toMs}:${interval}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(
      new Types.ObjectId(orgId),
      deviceId,
      fromMs,
      toMs,
      ['tempC', 'dewPointC', 'humidityPct'],
      demoOnly,
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
    const demoOnly = !!opts.demoOnly;
    const toMs = Date.now();
    const fromMs = toMs - hours * 3600_000;
    const key = `an:met:ptend:${orgId}:${deviceId}:${hours}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const rows = await this.metMeasures(new Types.ObjectId(orgId), deviceId, fromMs, toMs, ['pressureHpa'], demoOnly);
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
    demoOnly: boolean,
  ): Promise<Record<string, unknown>> {
    if (sessionId) return { sessionId };
    if (!deviceId) throw new BadRequestException('sessionId or deviceId is required');
    const ids = await this.nepSessionIds(orgId, deviceId, fromMs, toMs, demoOnly);
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:nep:dist:${orgId}:${sessionId ?? deviceId}:${fromMs}:${toMs}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const q = await this.nepSampleQuery(new Types.ObjectId(orgId), sessionId, deviceId, fromMs, toMs, demoOnly);
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:nep:probe:${orgId}:${deviceId}:${fromMs}:${toMs}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs, demoOnly);
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
    const demoOnly = !!opts.demoOnly;
    const key = `an:nep:corr:${orgId}:${sessionId ?? deviceId}:${fromMs}:${toMs}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const q = await this.nepSampleQuery(new Types.ObjectId(orgId), sessionId, deviceId, fromMs, toMs, demoOnly);
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
    const demoOnly = !!opts.demoOnly;
    const metersPerCell = resolution === 'low' ? 100 : resolution === 'high' ? 1 : 10;
    const cellDeg = metersPerCell / 111_320; // ~metres per degree latitude
    const key = `an:nep:gps:${orgId}:${deviceId}:${fromMs}:${toMs}:${resolution}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs, demoOnly);
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
  async orgDeviceComparison(orgId: string, deviceIds: string[], sensor: string, from?: string, to?: string, interval = '1h', opts: CommonOpts = {}) {
    if (!deviceIds.length) throw new BadRequestException('deviceIds[] is required');
    if (deviceIds.length > 5) throw new BadRequestException('Maximum 5 devices per request');
    const field = MET_SENSOR_FIELD[sensor];
    if (!field) throw new BadRequestException(`Unknown sensor "${sensor}"`);
    const intervalMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const { fromMs, toMs } = this.parseWindow(from, to);
    const demoOnly = !!opts.demoOnly;
    const orgObjId = new Types.ObjectId(orgId);
    const palette = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626'];

    const devices = await Device.find({ _id: { $in: deviceIds.map((d) => new Types.ObjectId(d)) }, organizationId: orgObjId, deletedAt: null })
      .select('_id name customName')
      .lean();

    const series = await Promise.all(
      devices.map(async (dev, i) => {
        const rows = await this.metMeasures(orgObjId, (dev._id as Types.ObjectId).toString(), fromMs, toMs, [field], demoOnly);
        const buckets = new Map<number, number[]>();
        for (const r of rows) {
          const v = (r as Record<string, unknown>)[field];
          if (typeof v !== 'number') continue;
          const b = bucketStart(r.timestampMs as number, intervalMs);
          (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(v);
        }
        const values = Array.from(buckets.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([ts, arr]) => ({ ts, value: round(mean(arr)) }));
        return { deviceId: (dev._id as Types.ObjectId).toString(), deviceName: dev.customName ?? dev.name, color: palette[i % palette.length], values };
      }),
    );
    return { sensor, unit: MET_SENSOR_UNIT[sensor], interval, series };
  }

  // ── GET /analytics/org/fleet-health ───────────────────────────────────────
  async orgFleetHealth(orgId: string, opts: CommonOpts = {}) {
    const demoOnly = !!opts.demoOnly;
    const key = `an:org:fleet:${orgId}:${demoOnly}`;
    const cached = fromCache(key);
    if (cached) return cached;

    const orgObjId = new Types.ObjectId(orgId);
    // Fleet health sweeps every device, so it needs the device-level mode filter
    // — a demo device must not be counted against the real fleet's health.
    const devices = await Device.find({
      organizationId: orgObjId,
      deletedAt: null,
      ...(await demoDeviceSelfFilter(orgObjId, demoOnly)),
    })
      .sort({ type: 1, name: 1 })
      .lean();
    const now = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;
    const MET_DOC_BYTES = 650;
    const NEP_DOC_BYTES = 120;

    const data = await Promise.all(
      devices.map(async (d) => {
        const devObjId = d._id as Types.ObjectId;
        let totalRecords = 0;
        let totalSessions = 0;
        let storageBytes = 0;
        if (d.type === 'MET-LINK') {
          const recs = await MetRecord.find({ deviceId: devObjId, deletedAt: null }).select('measureCount createdAt').lean();
          totalRecords = recs.length;
          const measures = recs.reduce((a, r) => a + (r.measureCount ?? 0), 0);
          storageBytes = measures * MET_DOC_BYTES;
        } else {
          const sess = await NepSession.find({ deviceId: devObjId, deletedAt: null }).select('sampleCount').lean();
          totalSessions = sess.length;
          const samples = sess.reduce((a, s) => a + (s.sampleCount ?? 0), 0);
          storageBytes = samples * NEP_DOC_BYTES;
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
          totalRecords,
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
    ], true);
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
    const ids = await this.nepSessionIds(new Types.ObjectId(orgId), deviceId, fromMs, toMs, true);
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
