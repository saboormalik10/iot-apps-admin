/**
 * Per-second readings → one record per station per minute.
 *
 * The station logs wind at roughly 1 Hz, which is 86,400 rows per station per
 * day. Almost nothing reads a single second: the charts bucket, the rollups
 * average, and the standard quantities WMO defines are all intervals. So the
 * minute is the stored record and the seconds are processed and discarded —
 * see `Device.storeRawSamples` for the exception.
 *
 * WHAT MUST BE COMPUTED HERE, BECAUSE IT CANNOT BE RECOVERED LATER
 *
 * The WMO gust is the peak 3-SECOND mean. Once the per-second samples are gone
 * it cannot be derived from minute means at any later date — a 1-minute average
 * has already smoothed the very peak the gust is meant to capture. So the gust
 * is computed here, from the samples, and stored on the minute. This is exactly
 * what a hardware logger does, and it is why every AWS reports gust alongside
 * mean rather than leaving it to the consumer.
 *
 * WHY THE VECTOR COMPONENTS ARE STORED
 *
 * The 2- and 10-minute means span several files, so they are built from minutes
 * that are already written. Combining them EXACTLY needs more than each minute's
 * mean direction: 350° and 10° average to 0°, not 180°, and that is only
 * recoverable from the sine and cosine components. Storing them costs two
 * numbers on 1,440 rows a day and makes the combination arithmetic rather than
 * approximate.
 *
 * They are persisted rather than held in memory on purpose. The API runs
 * serverless, so consecutive files for one station may be handled by different
 * instances and no in-process buffer can be relied on. State that must be
 * correct lives in the database; only caches live in memory.
 */

import { peakGust, WMO_GUST_WINDOW_MS } from '../analytics/wmo';
import type { ParsedMetRow } from './met-row';
import { roundBearing } from '../common/bearing';

export const MINUTE_MS = 60_000;

/** The minute a reading belongs to. */
export const minuteOf = (timestampMs: number): number => Math.floor(timestampMs / MINUTE_MS) * MINUTE_MS;

/** Mean unit-vector components of a set of bearings — the combinable form. */
export interface DirComponents {
  sin: number;
  cos: number;
  n: number;
}

export interface MinuteAggregate {
  /** Start of the minute, in epoch ms. The record key, with the station. */
  minuteMs: number;
  /** First raw CSV line of the minute, kept verbatim for provenance. */
  raw: string;

  // ── Wind, computed from the per-second samples ──────────────────────────
  /** Scalar mean speed over the minute. */
  windSpeedMs: number | null;
  /** Vector mean direction over the minute, relative to the mast. */
  windDirRelDeg: number | null;
  /** Samples the minute was built from — a mean of three is not a mean of sixty. */
  windSampleCount: number;
  /** Mean unit-vector components, so later windows combine exactly. */
  windDirSin: number | null;
  windDirCos: number | null;
  /** WMO gust: peak 3-second mean within the minute, and its direction. */
  windGustMs: number | null;
  windGustDirDeg: number | null;

  // ── Everything else: already one value a minute, carried through ────────
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  dewPointC: number | null;
  solarWm2: number | null;
  precipMm: number | null;
  voltageV: number | null;
  gpsLat: number | null;
  gpsLng: number | null;

  /** Union of the QC codes raised anywhere in the minute. */
  qc?: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Arithmetic mean of the present values, or null when the minute carried none. */
function meanOf(values: readonly (number | null)[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  return n === 0 ? null : round2(sum / n);
}

/** Mean unit-vector components for a set of bearings. */
export function dirComponents(bearings: readonly (number | null)[]): DirComponents {
  let sin = 0;
  let cos = 0;
  let n = 0;
  for (const b of bearings) {
    if (b === null || !Number.isFinite(b)) continue;
    const rad = (b * Math.PI) / 180;
    sin += Math.sin(rad);
    cos += Math.cos(rad);
    n += 1;
  }
  return n === 0 ? { sin: 0, cos: 0, n: 0 } : { sin: sin / n, cos: cos / n, n };
}

/**
 * Components → bearing.
 *
 * Near-total cancellation returns null rather than a bearing. Directions that
 * sum to nothing have no mean — reporting the `atan2` of two values that are
 * both essentially zero would put a confident arrow on what is actually "no
 * prevailing direction", and on a wind rose that reads as a real feature.
 */
export function dirFromComponents(c: DirComponents): number | null {
  if (c.n === 0) return null;
  if (Math.hypot(c.sin, c.cos) < 1e-9) return null;
  const deg = (Math.atan2(c.sin, c.cos) * 180) / Math.PI;
  return roundBearing(deg);
}

/** Fold per-second rows into one aggregate per clock minute, in time order. */
export function aggregateToMinutes(rows: readonly ParsedMetRow[]): MinuteAggregate[] {
  const buckets = new Map<number, ParsedMetRow[]>();
  for (const r of rows) {
    const key = minuteOf(r.timestampMs);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(r);
    else buckets.set(key, [r]);
  }

  const out: MinuteAggregate[] = [];
  for (const [minuteMs, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = [...bucket].sort((a, b) => a.timestampMs - b.timestampMs);

    const speeds = ordered.map((r) => r.windSpeedMs);
    const comps = dirComponents(ordered.map((r) => r.windDirRelDeg));

    // The gust is computed over this minute's samples only. A 3-second window
    // straddling a minute boundary is lost, which is the accepted cost of
    // reporting per minute — and the same one a hardware logger pays.
    const gust = peakGust(
      ordered.map((r) => ({ timestampMs: r.timestampMs, speedMs: r.windSpeedMs, dirDeg: r.windDirRelDeg })),
      WMO_GUST_WINDOW_MS,
    );

    const windN = speeds.filter((v): v is number => v !== null && Number.isFinite(v)).length;

    const codes = new Set<string>();
    for (const r of ordered) for (const c of r.qc ?? []) codes.add(c);

    out.push({
      minuteMs,
      raw: ordered[0].raw,
      windSpeedMs: meanOf(speeds),
      windDirRelDeg: dirFromComponents(comps),
      windSampleCount: windN,
      windDirSin: comps.n ? comps.sin : null,
      windDirCos: comps.n ? comps.cos : null,
      windGustMs: gust ? round2(gust.gustMs) : null,
      windGustDirDeg: gust ? gust.dirDeg : null,
      tempC: meanOf(ordered.map((r) => r.tempC)),
      humidityPct: meanOf(ordered.map((r) => r.humidityPct)),
      pressureHpa: meanOf(ordered.map((r) => r.pressureHpa)),
      dewPointC: meanOf(ordered.map((r) => r.dewPointC)),
      solarWm2: meanOf(ordered.map((r) => r.solarWm2)),
      // Rain is an accumulator, not a level: the minute's figure is its LAST
      // reading, never the average of a rising counter.
      precipMm: lastOf(ordered.map((r) => r.precipMm)),
      voltageV: meanOf(ordered.map((r) => r.voltageV)),
      gpsLat: lastOf(ordered.map((r) => r.gpsLat)),
      gpsLng: lastOf(ordered.map((r) => r.gpsLng)),
      ...(codes.size ? { qc: [...codes] } : {}),
    });
  }
  return out;
}

/** The last present value — for accumulators and positions, which do not average. */
function lastOf(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

/** One minute's contribution to a longer window. */
export interface MinuteWindowInput {
  minuteMs: number;
  windSpeedMs: number | null;
  windSampleCount: number;
  windDirSin: number | null;
  windDirCos: number | null;
}

export interface WindowMean {
  speedMs: number | null;
  dirDeg: number | null;
  /** Per-second samples behind the figure — thin windows are reported, not hidden. */
  samples: number;
  /** Minutes actually present. A 10-minute mean from 2 minutes is not one. */
  minutes: number;
}

/**
 * Combine consecutive minutes into a longer mean, weighted by sample count.
 *
 * Weighting matters: a minute built from 8 samples after a dropout must not
 * carry the same weight as one built from 60, or a gap quietly biases the
 * average toward whatever the station managed to report while struggling.
 *
 * `windowMs` bounds the window from `endMinuteMs` backwards. Minutes outside it
 * are ignored, so a caller may pass more than it needs.
 */
export function combineMinutes(
  minutes: readonly MinuteWindowInput[],
  endMinuteMs: number,
  windowMs: number,
): WindowMean {
  const startMs = endMinuteMs - windowMs + MINUTE_MS;
  let speedWeighted = 0;
  let sin = 0;
  let cos = 0;
  let samples = 0;
  let present = 0;

  for (const m of minutes) {
    if (m.minuteMs < startMs || m.minuteMs > endMinuteMs) continue;
    present += 1;
    const n = m.windSampleCount || 0;
    if (n <= 0) continue;
    if (m.windSpeedMs !== null && Number.isFinite(m.windSpeedMs)) {
      speedWeighted += m.windSpeedMs * n;
      samples += n;
    }
    if (m.windDirSin !== null && m.windDirCos !== null) {
      sin += m.windDirSin * n;
      cos += m.windDirCos * n;
    }
  }

  return {
    speedMs: samples > 0 ? round2(speedWeighted / samples) : null,
    dirDeg: samples > 0 ? dirFromComponents({ sin: sin / samples, cos: cos / samples, n: samples }) : null,
    samples,
    minutes: present,
  };
}
