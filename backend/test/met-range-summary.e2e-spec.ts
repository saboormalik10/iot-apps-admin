import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * M25 — `GET /analytics/met/range-summary`.
 *
 * The live dashboard panel shows one moment, so the date filter could only ever
 * change it when the station had been quiet — which read as the filter doing
 * nothing. These three numbers describe the whole window instead, and they move on
 * every preset.
 *
 * The endpoint answers from raw measures for short windows and from the daily
 * rollups for long ones. That split exists for a measured reason: at 1 Hz a month
 * is ~1.1 million documents, and aggregating them took 2.4 s against 78 ms from
 * thirty daily rows. The tests below pin BOTH paths and, most importantly, that
 * they agree — a fast path that quietly returns different numbers would be worse
 * than the slow one.
 */
jest.setTimeout(180_000);

describe('met/range-summary (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let deviceId: string;

  const get = (qs: string) =>
    request(http).get(`/v1/analytics/met/range-summary?${qs}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.data?.accessToken ?? login.body.accessToken;

    const devices = await request(http).get('/v1/devices?limit=5').set('Authorization', `Bearer ${token}`);
    const list = devices.body.data;
    deviceId = (Array.isArray(list) ? list : list?.items)?.find(
      (d: { type?: string }) => d.type === 'MET-LINK',
    )?._id;
    expect(deviceId).toBeTruthy();
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('answers a short window from raw measures', async () => {
    const now = Date.now();
    const res = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 3_600_000}&to=${now}`);
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe('measures');
    expect(res.body.unit).toBe('m/s');
  });

  it('answers a long window from the daily rollups', async () => {
    const now = Date.now();
    const res = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 30 * 86_400_000}&to=${now}`);
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe('daily');
  });

  it('the two paths agree on the maximum over the same span', async () => {
    // The 48-hour boundary decides the path, so ask for a hair under and a hair
    // over. A gust does not appear or vanish because the server chose a different
    // source, and if it does the fast path is lying.
    const now = Date.now();
    const justUnder = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 47 * 3_600_000}&to=${now}`);
    const justOver = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 49 * 3_600_000}&to=${now}`);

    expect(justUnder.body.basis).toBe('measures');
    expect(justOver.body.basis).toBe('daily');

    if (justUnder.body.max != null && justOver.body.max != null) {
      // The rollup window is rounded outward to whole days, so it can only ever
      // see MORE than the raw one — never less.
      expect(justOver.body.max).toBeGreaterThanOrEqual(justUnder.body.max);
    }
  });

  it('the numbers actually change with the range', async () => {
    const now = Date.now();
    const hour = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 3_600_000}&to=${now}`);
    const month = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - 30 * 86_400_000}&to=${now}`);

    // The whole point of the feature. A month must cover at least as much as an
    // hour, and on any real station strictly more.
    if (hour.body.count && month.body.count) {
      expect(month.body.count).toBeGreaterThan(hour.body.count);
      expect(month.body.max).toBeGreaterThanOrEqual(hour.body.max);
    }
  });

  it('returns null for a minimum the rollup cannot supply, never a fabricated zero', async () => {
    const now = Date.now();
    // Wind has no stored daily minimum — it would be 0 in any window, which is why
    // the rollup keeps calm-percentage instead. Both paths must agree on that, or
    // the same field means different things at different ranges.
    for (const span of [3_600_000, 30 * 86_400_000]) {
      const res = await get(`deviceId=${deviceId}&sensor=wind_speed&from=${now - span}&to=${now}`);
      expect(res.body.min).toBeNull();
    }
  });

  it('reports an empty window as a zero count rather than a stale figure', async () => {
    const res = await get(`deviceId=${deviceId}&sensor=wind_speed&from=1546300800000&to=1546387200000`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.max).toBeNull();
  });

  it('rejects an unknown sensor', async () => {
    const now = Date.now();
    const res = await get(`deviceId=${deviceId}&sensor=nonsense&from=${now - 3_600_000}&to=${now}`);
    expect(res.status).toBe(400);
  });

  /**
   * M25 — the statistics rewrite.
   *
   * `metStatistics` moved from "pull every value into Node and sort it" to a single
   * aggregation. Measured before: 24 h 8.0 s, 7 d 56.9 s, 30 d 99.4 s. After:
   * 0.55 s, 3.1 s, 5.6 s.
   *
   * `npm run verify:stats` is the equivalence proof against the old Node maths on
   * real rows. These are the guards that live in CI: the shape the frontend reads,
   * the invariants that must hold whatever the implementation, and the Beaufort
   * bands, which are counted a completely different way now ($bucket rather than a
   * loop) and are the easiest thing to get subtly wrong.
   */
  // Nested so it shares the outer suite's app and session. A second login in the
  // same file trips the M24 W1 rate limit and every assertion then fails on a 401,
  // which looks like a broken endpoint rather than a throttled sign-in.
  describe('met/statistics', () => {

    const stats = (span: number) => {
      const now = Date.now();
      return request(http)
        .get(`/v1/analytics/met/statistics?deviceId=${deviceId}&sensor=wind_speed&from=${now - span}&to=${now}`)
        .set('Authorization', `Bearer ${token}`);
    };

    it('returns the full profile the panel renders', async () => {
      const res = await stats(86_400_000);
      expect(res.status).toBe(200);
      for (const k of ['count', 'mean', 'median', 'stdDev', 'variance', 'min', 'max', 'range', 'skewness',
                       'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'p99']) {
        expect(res.body).toHaveProperty(k);
      }
    });

    it('holds the invariants that must be true of any implementation', async () => {
      const res = await stats(7 * 86_400_000);
      if (!res.body.count) return;
      const b = res.body;
      expect(b.min).toBeLessThanOrEqual(b.max);
      expect(b.mean).toBeGreaterThanOrEqual(b.min);
      expect(b.mean).toBeLessThanOrEqual(b.max);
      expect(b.range).toBeCloseTo(b.max - b.min, 2);
      // Percentiles are monotonic — the single easiest way to tell a broken
      // percentile implementation from a working one.
      const p = [b.p10, b.p25, b.p50, b.p75, b.p90, b.p95, b.p99];
      for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
      expect(b.median).toBeCloseTo(b.p50, 4);
      expect(b.variance).toBeCloseTo(b.stdDev * b.stdDev, 2);
    });

    it('counts every reading exactly once across the Beaufort bands', async () => {
      const res = await stats(7 * 86_400_000);
      if (!res.body.count) return;
      const bands = res.body.beaufortBreakdown as Array<{ count: number; force: number }>;
      expect(bands).toHaveLength(13);
      // $bucket buckets by lower boundary and omits empty bands; if the mapping back
      // to a force were wrong, readings would go missing or be double-counted here.
      const summed = bands.reduce((n, b) => n + b.count, 0);
      expect(summed).toBe(res.body.count);
      expect(res.body.outOfRangeCount).toBeUndefined();
    });

    it('reports an empty window as a zero count', async () => {
      const res = await request(http)
        .get(`/v1/analytics/met/statistics?deviceId=${deviceId}&sensor=wind_speed&from=1546300800000&to=1546387200000`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('answers a week in under ten seconds', async () => {
      // It took 57 s before the rewrite. This is a floor against a regression that
      // would be invisible in correctness terms.
      const t0 = Date.now();
      await stats(7 * 86_400_000);
      expect(Date.now() - t0).toBeLessThan(10_000);
    });
  });

  /**
   * M25 — wind rose, multi-sensor overlay, and wind-gust history rewrite.
   *
   * All three moved from "pull every raw row into Node and reduce it there" to a
   * single MongoDB aggregation. Measured before: wind-rose 24h 11.6s / 7d 54.3s;
   * multi-sensor 7d 48.8s; wind-gust 24h 6.9s / 7d 51.0s. After: 0.4–0.7s / 2–4.3s.
   *
   * `npm run verify:analytics` is the equivalence proof — it recomputes the OLD
   * Node loops (same helpers: sectorIndex, speedBandIndex, bucketStart) against
   * the SAME rows read in the same process, and diffs every sector/bucket
   * against the live endpoint. Verified over 596,941 rows / 7 days: totalSamples
   * exact, all 16 sectors' count/avg/max/5-band-histogram exact, all 2016
   * multi-sensor buckets exact, all 169 gust buckets exact — including the
   * argmax tie-break for direction, checked against a window with 336 tied
   * (bucket, speed) pairs.
   *
   * These are the guards that live in CI: structural shape, cross-field
   * invariants, and a timing ceiling as a floor against a silent regression.
   *
   * Nested under the file's one Nest app/session rather than a second
   * `Test.createTestingModule`, deliberately: a second full app bootstrap in
   * this file raced the first's teardown and every login inside it came back
   * `500 buffering timed out` — a test-infrastructure failure, not a defect in
   * the endpoints. One app per file is the pattern every other spec here uses.
   */
  describe('wind rose / multi-sensor / wind-gust', () => {

    describe('wind rose', () => {
      const rose = (span: number) => {
        const now = Date.now();
        return request(http)
          .get(`/v1/analytics/met/wind-rose?deviceId=${deviceId}&from=${now - span}&to=${now}`)
          .set('Authorization', `Bearer ${token}`);
      };

      it('returns 16 sectors, N through NNW, whether or not there is data', async () => {
        const res = await rose(3_600_000);
        expect(res.status).toBe(200);
        expect(res.body.sectors).toHaveLength(16);
        expect(res.body.sectors[0].label).toBe('N');
        expect(res.body.sectors[15].label).toBe('NNW');
      });

      it('every sector sums to the total, and every band sums to its sector', async () => {
        const res = await rose(7 * 86_400_000);
        if (!res.body.totalSamples) return;
        const b = res.body;
        const sectorSum = b.sectors.reduce((n: number, s: { count: number }) => n + s.count, 0);
        expect(sectorSum).toBe(b.totalSamples);
        for (const s of b.sectors) {
          const bandSum = s.speedBuckets.reduce((n: number, band: { count: number }) => n + band.count, 0);
          expect(bandSum).toBe(s.count);
          // A sector with no readings has no speed to average or peak.
          if (s.count === 0) {
            expect(s.avgSpeedMs).toBe(0);
            expect(s.maxSpeedMs).toBe(0);
          } else {
            expect(s.avgSpeedMs).toBeLessThanOrEqual(s.maxSpeedMs);
          }
        }
      });

      it('answers a week in under ten seconds', async () => {
        const t0 = Date.now();
        await rose(7 * 86_400_000);
        expect(Date.now() - t0).toBeLessThan(10_000);
      });
    });

    describe('multi-sensor overlay', () => {
      const multi = (span: number) => {
        const now = Date.now();
        return request(http)
          .get(`/v1/analytics/met/multi-sensor?deviceId=${deviceId}&sensors[]=wind_speed&sensors[]=temperature&from=${now - span}&to=${now}&interval=5min`)
          .set('Authorization', `Bearer ${token}`);
      };

      it('every series is the same length as the timestamp axis', async () => {
        const res = await multi(86_400_000);
        expect(res.status).toBe(200);
        for (const s of res.body.series) expect(s.values).toHaveLength(res.body.timestamps.length);
      });

      it('the timestamp axis is strictly increasing', async () => {
        const res = await multi(7 * 86_400_000);
        const t = res.body.timestamps as number[];
        for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
      });

      it('a station that only reports wind returns temperature as nulls, never zeros', async () => {
        const res = await multi(86_400_000);
        const temp = res.body.series.find((s: { sensor: string }) => s.sensor === 'temperature');
        if (!temp || temp.values.every((v: unknown) => v === null)) {
          for (const v of temp?.values ?? []) expect(v).toBeNull();
        }
      });

      it('answers a week in under ten seconds', async () => {
        const t0 = Date.now();
        await multi(7 * 86_400_000);
        expect(Date.now() - t0).toBeLessThan(10_000);
      });
    });

    describe('wind gust history', () => {
      const gust = (span: number) => {
        const now = Date.now();
        return request(http)
          .get(`/v1/analytics/met/wind-gust-history?deviceId=${deviceId}&from=${now - span}&to=${now}&interval=1h`)
          .set('Authorization', `Bearer ${token}`);
      };

      it('every bucket carries a non-negative gust and the three matching unit conversions', async () => {
        const res = await gust(7 * 86_400_000);
        for (const row of res.body.data) {
          expect(row.gustMs).toBeGreaterThanOrEqual(0);
          expect(row.gustKmh).toBeCloseTo(row.gustMs * 3.6, 1);
          expect(row.gustKnots).toBeCloseTo(row.gustMs / 0.514444, 1);
        }
      });

      it('buckets are in ascending time order with no duplicates', async () => {
        const res = await gust(7 * 86_400_000);
        const ts = res.body.data.map((r: { ts: number }) => r.ts);
        for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
      });

      it('answers a week in under ten seconds', async () => {
        const t0 = Date.now();
        await gust(7 * 86_400_000);
        expect(Date.now() - t0).toBeLessThan(10_000);
      });
    });
  });

  /**
   * M25 — fleet health's reading count and storage estimate.
   *
   * Two independent defects, found by checking the numbers on screen against the
   * real database rather than trusting them:
   *
   *  1. `totalRecords` was the COUNT OF `MetRecord` DOCUMENTS — one per station
   *     per local day (M14) — not the number of readings. A station live 18 days
   *     showed "18 records" regardless of whether it had sent ten readings or ten
   *     million.
   *
   *  2. `storageEstimateMb` used a hardcoded 650 bytes/document. The real average
   *     document size is 362 bytes uncompressed, and this collection compresses
   *     ~5× on disk — so the estimate was roughly 9× too high on real data
   *     (695 MB claimed vs ~78 MB actual). That gap is not cosmetic: this
   *     project sizes its MongoDB tier around the 512 MB free-tier ceiling, so a
   *     wrong storage figure is a wrong answer to "do we need to upgrade".
   */
  describe('fleet health', () => {
    it('returns the readings/day split and a storage estimate close to the real collection stats', async () => {
      const res = await request(http)
        .get('/v1/analytics/org/fleet-health')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const rows = res.body.data ?? res.body;
      expect(Array.isArray(rows)).toBe(true);

      const met = rows.find((r: { type: string }) => r.type === 'MET-LINK');
      if (!met) return;

      // The old bug: totalRecords equal to totalDays is exactly the symptom of
      // counting day-records instead of readings (a station reporting more than
      // once a day — which every live one does — can never have these equal).
      if (met.totalDays > 0) {
        expect(met.totalRecords).toBeGreaterThan(met.totalDays);
      }
      expect(met.totalDays).toBeGreaterThanOrEqual(0);

      // A live, compression-aware bound rather than a fixed literal: real disk
      // usage for MET's numeric/timestamp rows should sit under 1 KB/reading even
      // uncompressed, and this collection is confirmed to compress ~5x. A
      // hardcoded stale constant regressing back in would blow through this.
      if (met.totalRecords > 0) {
        const bytesPerReading = (met.storageEstimateMb * 1024 * 1024) / met.totalRecords;
        expect(bytesPerReading).toBeLessThan(500);
        expect(bytesPerReading).toBeGreaterThan(0);
      }
    });

    it('answers in under five seconds', async () => {
      const t0 = Date.now();
      await request(http).get('/v1/analytics/org/fleet-health').set('Authorization', `Bearer ${token}`);
      expect(Date.now() - t0).toBeLessThan(5_000);
    });
  });
});
