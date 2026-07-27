import { downsampleEnvelope, type EnvelopePoint } from '../src/utils/cache.util';
import { pickBucketMs } from '../src/dashboard/dashboard.service';

/**
 * Pure-logic tests (no DB) for the dashboard graph-data path:
 *  - `downsampleEnvelope` must shrink a series WITHOUT losing peaks/troughs, so
 *    the API can cap far lower than the old naive decimation did.
 *  - `pickBucketMs` must return a coarser bucket for a wider window, which is
 *    what keeps a graph's payload bounded regardless of the range picked.
 */
describe('graph aggregation (unit)', () => {
  const mk = (n: number, fill: Partial<EnvelopePoint> = {}): EnvelopePoint[] =>
    Array.from({ length: n }, (_, i) => ({
      timestampMs: i * 60_000,
      min: 1,
      max: 1,
      avg: 1,
      count: 1,
      ...fill,
    }));

  describe('downsampleEnvelope', () => {
    it('returns the input untouched when already under the cap', () => {
      const arr = mk(10);
      expect(downsampleEnvelope(arr, 500)).toBe(arr);
    });

    it('caps the series to at most maxPoints', () => {
      expect(downsampleEnvelope(mk(5000), 500).length).toBeLessThanOrEqual(500);
    });

    it('preserves a max spike that naive decimation would drop', () => {
      const arr = mk(1000);
      arr[500] = { timestampMs: 500 * 60_000, min: 1, max: 999, avg: 1, count: 1 };
      const out = downsampleEnvelope(arr, 50);
      // The spike lands on an index that even-decimation (every 20th point) skips,
      // but the envelope must keep it in the max band.
      expect(Math.max(...out.map((p) => p.max))).toBe(999);
    });

    it('preserves a min trough', () => {
      const arr = mk(1000);
      arr[123] = { timestampMs: 123 * 60_000, min: -50, max: 1, avg: 1, count: 1 };
      const out = downsampleEnvelope(arr, 40);
      expect(Math.min(...out.map((p) => p.min))).toBe(-50);
    });

    it('computes a count-weighted average across merged buckets', () => {
      // 4 points → 2 output buckets. First bucket merges avg 2 (count 3) + avg 10
      // (count 1) → (2*3 + 10*1) / 4 = 4.
      const arr: EnvelopePoint[] = [
        { timestampMs: 0, min: 2, max: 2, avg: 2, count: 3 },
        { timestampMs: 1, min: 10, max: 10, avg: 10, count: 1 },
        { timestampMs: 2, min: 5, max: 5, avg: 5, count: 1 },
        { timestampMs: 3, min: 5, max: 5, avg: 5, count: 1 },
      ];
      const out = downsampleEnvelope(arr, 2);
      expect(out).toHaveLength(2);
      expect(out[0].avg).toBe(4);
      expect(out[0].count).toBe(4);
    });
  });

  describe('pickBucketMs', () => {
    it('never goes finer than one minute', () => {
      expect(pickBucketMs(60_000)).toBe(60_000);
      expect(pickBucketMs(0)).toBe(60_000);
    });

    it('grows the bucket as the window widens (bounded point count)', () => {
      const hour = pickBucketMs(60 * 60_000); // 1h window
      const day = pickBucketMs(24 * 60 * 60_000); // 1d window
      const month = pickBucketMs(30 * 24 * 60 * 60_000); // 30d window
      expect(hour).toBeLessThanOrEqual(day);
      expect(day).toBeLessThanOrEqual(month);
      // A 30-day window at ~500 buckets must be far coarser than 1 minute.
      expect(month).toBeGreaterThan(60_000);
    });
  });
});
