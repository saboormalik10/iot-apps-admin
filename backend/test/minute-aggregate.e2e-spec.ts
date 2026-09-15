import {
  aggregateToMinutes,
  combineMinutes,
  dirComponents,
  dirFromComponents,
  minuteOf,
  MINUTE_MS,
} from '../src/ingest/minute-aggregate';
import type { ParsedMetRow } from '../src/ingest/met-csv/parse-met-csv';

/**
 * Per-second readings → one record per minute.
 *
 * The cases that matter are the ones where a minute mean is NOT simply "the
 * average of the column": direction, which cannot be averaged arithmetically;
 * gust, which must survive the smoothing; and rain, which accumulates.
 */

const t0 = Date.UTC(2026, 8, 15, 6, 0, 0);

function row(timestampMs: number, over: Partial<ParsedMetRow> = {}): ParsedMetRow {
  return {
    timestampMs,
    raw: `raw@${timestampMs}`,
    windSpeedMs: null, windSpeedKmh: null, windSpeedKnots: null, windDirRelDeg: null,
    tempC: null, humidityPct: null, pressureHpa: null, dewPointC: null,
    solarWm2: null, precipMm: null, voltageV: null, gpsLat: null, gpsLng: null,
    status: null,
    ...over,
  };
}

/** A minute of 1 Hz wind. */
const minute = (startMs: number, speed: (i: number) => number, dir: (i: number) => number, n = 60) =>
  Array.from({ length: n }, (_, i) => row(startMs + i * 1000, { windSpeedMs: speed(i), windDirRelDeg: dir(i) }));

describe('aggregateToMinutes — bucketing', () => {
  it('folds a minute of 1 Hz wind into a single record', () => {
    const out = aggregateToMinutes(minute(t0, () => 5, () => 90));
    expect(out).toHaveLength(1);
    expect(out[0].minuteMs).toBe(t0);
    expect(out[0].windSpeedMs).toBe(5);
    expect(out[0].windSampleCount).toBe(60);
  });

  it('splits readings across the minute boundary they belong to', () => {
    const out = aggregateToMinutes([
      ...minute(t0, () => 2, () => 0, 60),
      ...minute(t0 + MINUTE_MS, () => 8, () => 0, 60),
    ]);
    expect(out.map((m) => m.minuteMs)).toEqual([t0, t0 + MINUTE_MS]);
    expect(out.map((m) => m.windSpeedMs)).toEqual([2, 8]);
  });

  it('keeps a short minute, and says how short', () => {
    // A dropout must not be hidden: the count is what lets a consumer judge it.
    const out = aggregateToMinutes(minute(t0, () => 4, () => 10, 7));
    expect(out[0].windSpeedMs).toBe(4);
    expect(out[0].windSampleCount).toBe(7);
  });

  it('sorts a batch delivered out of order', () => {
    const out = aggregateToMinutes([row(t0 + 2000, { windSpeedMs: 3 }), row(t0, { windSpeedMs: 1 })]);
    expect(out[0].raw).toBe(`raw@${t0}`);
  });
});

describe('aggregateToMinutes — direction is a vector, not a number', () => {
  it('averages 350° and 10° to due north, not due south', () => {
    const out = aggregateToMinutes([
      row(t0, { windSpeedMs: 3, windDirRelDeg: 350 }),
      row(t0 + 1000, { windSpeedMs: 3, windDirRelDeg: 10 }),
    ]);
    expect(out[0].windDirRelDeg).toBe(0);
  });

  it('reports no direction when the minute cancels out', () => {
    // Opposing bearings have no mean. A confident arrow here would be invented.
    const out = aggregateToMinutes([
      row(t0, { windSpeedMs: 3, windDirRelDeg: 0 }),
      row(t0 + 1000, { windSpeedMs: 3, windDirRelDeg: 180 }),
    ]);
    expect(out[0].windDirRelDeg).toBeNull();
  });

  it('ignores calm readings that carry no bearing', () => {
    // 31% of the live corpus is calm and reports no direction. Treating those as
    // 0° would pile a false spike onto due north.
    const out = aggregateToMinutes([
      row(t0, { windSpeedMs: 0.1, windDirRelDeg: null }),
      row(t0 + 1000, { windSpeedMs: 3, windDirRelDeg: 90 }),
    ]);
    expect(out[0].windDirRelDeg).toBe(90);
  });
});

describe('aggregateToMinutes — the gust must survive the averaging', () => {
  it('keeps a 3-second gust that the minute mean smooths away', () => {
    /**
     * THE REASON THIS MODULE COMPUTES THE GUST AT ALL. Once the per-second rows
     * are discarded the peak is unrecoverable — a minute mean has already
     * averaged it out. Here 57 seconds of 2 m/s and 3 seconds of 20 m/s give a
     * mean near 2.9, and the gust is the thing that actually happened.
     */
    const rows = [
      ...Array.from({ length: 57 }, (_, i) => row(t0 + i * 1000, { windSpeedMs: 2, windDirRelDeg: 90 })),
      ...Array.from({ length: 3 }, (_, i) => row(t0 + (57 + i) * 1000, { windSpeedMs: 20, windDirRelDeg: 90 })),
    ];
    const [m] = aggregateToMinutes(rows);
    expect(m.windSpeedMs).toBeCloseTo(2.9, 1);
    expect(m.windGustMs).toBe(20);
    expect(m.windGustDirDeg).toBe(90);
  });

  it('reports the 3-second MEAN, never the single highest sample', () => {
    // One noisy sample is not a gust; that was the old, non-compliant behaviour.
    const rows = [
      ...Array.from({ length: 59 }, (_, i) => row(t0 + i * 1000, { windSpeedMs: 4 })),
      row(t0 + 59_000, { windSpeedMs: 40 }),
    ];
    const [m] = aggregateToMinutes(rows);
    expect(m.windGustMs).toBeLessThan(40);
    expect(m.windGustMs).toBeGreaterThan(4);
  });

  it('has no gust for a minute with no wind readings', () => {
    const [m] = aggregateToMinutes([row(t0, { tempC: 18 })]);
    expect(m.windGustMs).toBeNull();
    expect(m.windSampleCount).toBe(0);
  });
});

describe('aggregateToMinutes — quantities that do not average', () => {
  it('takes the LAST rain reading, never the mean of a rising counter', () => {
    /**
     * The gauge reports a running total. Averaging 0.2, 0.4 and 0.6 gives 0.4 —
     * a figure that was true only in the middle of the minute and that makes the
     * next minute's difference wrong in both directions.
     */
    const [m] = aggregateToMinutes([
      row(t0, { precipMm: 0.2 }),
      row(t0 + 20_000, { precipMm: 0.4 }),
      row(t0 + 40_000, { precipMm: 0.6 }),
    ]);
    expect(m.precipMm).toBe(0.6);
  });

  it('takes the last GPS fix rather than a midpoint', () => {
    const [m] = aggregateToMinutes([
      row(t0, { gpsLat: 1, gpsLng: 10 }),
      row(t0 + 30_000, { gpsLat: 2, gpsLng: 20 }),
    ]);
    expect(m.gpsLat).toBe(2);
    expect(m.gpsLng).toBe(20);
  });

  it('averages temperature, which does average', () => {
    const [m] = aggregateToMinutes([row(t0, { tempC: 10 }), row(t0 + 30_000, { tempC: 12 })]);
    expect(m.tempC).toBe(11);
  });
});

describe('aggregateToMinutes — QC codes travel with the minute', () => {
  it('carries the union of the codes raised in the minute', () => {
    const [m] = aggregateToMinutes([
      row(t0, { windSpeedMs: 3, qc: ['status:V'] }),
      row(t0 + 1000, { windSpeedMs: 3, qc: ['range:tempC'] }),
      row(t0 + 2000, { windSpeedMs: 3, qc: ['status:V'] }),
    ]);
    expect(new Set(m.qc)).toEqual(new Set(['status:V', 'range:tempC']));
  });

  it('leaves a clean minute with no qc key at all', () => {
    const [m] = aggregateToMinutes(minute(t0, () => 3, () => 90, 5));
    expect(m.qc).toBeUndefined();
  });
});

describe('combineMinutes — the 2- and 10-minute means', () => {
  const m = (minuteMs: number, speed: number, dirDeg: number, n = 60) => {
    const c = dirComponents([dirDeg]);
    return { minuteMs, windSpeedMs: speed, windSampleCount: n, windDirSin: c.sin, windDirCos: c.cos };
  };

  it('averages the minutes inside the window and ignores the rest', () => {
    const mins = [m(t0, 10, 90), m(t0 + MINUTE_MS, 20, 90), m(t0 + 2 * MINUTE_MS, 30, 90)];
    const two = combineMinutes(mins, t0 + 2 * MINUTE_MS, 2 * MINUTE_MS);
    expect(two.speedMs).toBe(25); // the last two minutes only
    expect(two.minutes).toBe(2);
  });

  it('weights by sample count, so a thin minute cannot outvote a full one', () => {
    /**
     * A minute rebuilt from 6 samples after a dropout must not count as much as
     * one built from 60 — otherwise an outage quietly drags the average toward
     * whatever the station managed to report while it was struggling.
     */
    const mins = [m(t0, 10, 90, 60), m(t0 + MINUTE_MS, 20, 90, 6)];
    const out = combineMinutes(mins, t0 + MINUTE_MS, 2 * MINUTE_MS);
    expect(out.speedMs).toBeCloseTo((10 * 60 + 20 * 6) / 66, 2);
    expect(out.samples).toBe(66);
  });

  it('combines direction as a vector across minutes too', () => {
    const mins = [m(t0, 5, 350), m(t0 + MINUTE_MS, 5, 10)];
    const out = combineMinutes(mins, t0 + MINUTE_MS, 2 * MINUTE_MS);
    expect(out.dirDeg).toBe(0);
  });

  it('reports how many minutes it actually had', () => {
    // A 10-minute mean built from 3 minutes is not a 10-minute mean; the caller
    // needs to be able to say so rather than present it as complete.
    const mins = [m(t0, 5, 90), m(t0 + MINUTE_MS, 5, 90), m(t0 + 2 * MINUTE_MS, 5, 90)];
    const out = combineMinutes(mins, t0 + 2 * MINUTE_MS, 10 * MINUTE_MS);
    expect(out.minutes).toBe(3);
    expect(out.speedMs).toBe(5);
  });

  it('returns nothing for a window with no wind at all', () => {
    const out = combineMinutes([], t0, 10 * MINUTE_MS);
    expect(out.speedMs).toBeNull();
    expect(out.dirDeg).toBeNull();
    expect(out.samples).toBe(0);
  });

  it('round-trips a full ten minutes exactly', () => {
    const mins = Array.from({ length: 10 }, (_, i) => m(t0 + i * MINUTE_MS, 6, 45));
    const out = combineMinutes(mins, t0 + 9 * MINUTE_MS, 10 * MINUTE_MS);
    expect(out.speedMs).toBe(6);
    expect(out.dirDeg).toBe(45);
    expect(out.minutes).toBe(10);
    expect(out.samples).toBe(600);
  });
});

describe('helpers', () => {
  it('minuteOf floors to the clock minute', () => {
    expect(minuteOf(t0 + 59_999)).toBe(t0);
    expect(minuteOf(t0 + 60_000)).toBe(t0 + MINUTE_MS);
  });

  it('components round-trip a bearing', () => {
    expect(dirFromComponents(dirComponents([123]))).toBeCloseTo(123, 1);
  });
});
