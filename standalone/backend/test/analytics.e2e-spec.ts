import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 3 analytics + export + sync integration tests.
 * Uses the data created by `npm run seed`. Run the seed first.
 */
describe('Analytics & Sync (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let metDeviceId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();

    const login = await request(http).post('/v1/auth/login').send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.accessToken ?? login.body.data?.accessToken;

    // The seeded station, by its fixed id. Other suites create and remove
    // stations in this organisation while this one runs, so "the first MET
    // station" is sometimes one with no data.
    const devices = await request(http)
      .get('/v1/devices')
      .query({ bleId: 'MET-00:11:22:33:44:55' })
      .set('Authorization', `Bearer ${token}`);
    metDeviceId = devices.body.data?.[0]?._id;
    expect(metDeviceId).toBeTruthy();
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('MET wind-rose returns 16 sectors', async () => {
    const res = await request(http).get('/v1/analytics/met/wind-rose').query({ deviceId: metDeviceId }).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.sectors).toHaveLength(16);
    expect(res.body.sectors[0]).toHaveProperty('speedBuckets');
  });

  it('MET statistics returns percentiles for temperature', async () => {
    const res = await request(http)
      .get('/v1/analytics/met/statistics')
      .query({ deviceId: metDeviceId, sensor: 'temperature' })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('p95');
    expect(res.body).toHaveProperty('median');
  });

  /**
   * §10.5 — QNH / QFE / GPS-altitude are comparable analytics sensors.
   *
   * What this asserts is that the sensor NAME is wired through: a name the map
   * does not know answers 400 "Unknown sensor", and that is the regression worth
   * catching.
   *
   * It used to also demand a `median`, which made it fail against the real
   * database for a reason that is not a defect: the wind station does not report
   * these three, so the endpoint correctly answers `200 {count: 0}` with no
   * percentiles to give. Percentiles are asserted only when rows exist, so the
   * test stays meaningful on a device that does report them.
   */
  it.each(['qnh', 'qfe', 'gps_altitude'])('MET statistics accepts the %s sensor (§10.5)', async (sensor) => {
    const res = await request(http)
      .get('/v1/analytics/met/statistics')
      .query({ deviceId: metDeviceId, sensor })
      .set(auth());
    expect(res.status).toBe(200); // not 400 "Unknown sensor" → the map wiring works
    expect(res.body.sensor).toBe(sensor);
    expect(res.body).toHaveProperty('count');
    if (res.body.count > 0) expect(res.body).toHaveProperty('median');
  });

  it('MET multi-sensor overlays the three §10.5 sensors', async () => {
    const res = await request(http)
      .get('/v1/analytics/met/multi-sensor')
      .query({ deviceId: metDeviceId, sensors: ['qnh', 'qfe', 'gps_altitude'] })
      .set(auth());
    expect(res.status).toBe(200);
  });

  // §10.7 — daily-summary rollups (populated incrementally on sync + by backfill).
  it('MET daily-summary returns an array with completeness fields', async () => {
    const res = await request(http)
      .get('/v1/analytics/met/daily-summary')
      .query({ deviceId: metDeviceId })
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      expect(res.body[0]).toHaveProperty('completenessPercent');
      expect(res.body[0]).toHaveProperty('beaufortDistribution');
      expect(res.body[0]).toHaveProperty('date');
    }
  });

  it('MET daily-summary requires deviceId', async () => {
    const res = await request(http).get('/v1/analytics/met/daily-summary').set(auth());
    expect(res.status).toBe(400);
  });

  it('MET export-bulk CSV has a header row', async () => {
    // An explicit narrow window: the assertion is about the CSV SHAPE, and
    // without a bound this pulls ninety days of per-second rows over HTTP —
    // ~37s on its own, and enough to time out its siblings in a parallel run.
    const to = Date.now();
    const res = await request(http)
      .get('/v1/analytics/met/export-bulk')
      .query({ deviceId: metDeviceId, format: 'csv', from: to - 60 * 60_000, to })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0]).toContain('Timestamp');
  });

  it('MET export-bulk accepts "All time" (no `from`) instead of refusing it', async () => {
    /**
     * `parseWindow` turns a missing `from` into 0 — "All time", which is what the
     * Scope Bar's preset sends. Every such request then spanned ~56 years and was
     * refused by the 90-day cap, so All time could never export: two comments in
     * `analytics.service.ts` contradicted each other and the endpoint always
     * answered 400.
     *
     * `to` is pinned to a quiet historical instant so the clamped 90-day window
     * holds little data — this proves the status, not the payload, and stays fast.
     */
    const res = await request(http)
      .get('/v1/analytics/met/export-bulk')
      .query({ deviceId: metDeviceId, format: 'csv', to: Date.UTC(2021, 0, 1) })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0]).toContain('Timestamp');
  });

  it('dashboard org/device-map returns devices with GPS', async () => {
    const res = await request(http).get('/v1/dashboard/org/device-map').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('device health summary shape', async () => {
    const res = await request(http).get(`/v1/devices/${metDeviceId}/health`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('isOnline');
    expect(res.body.data).toHaveProperty('lastSyncLagSeconds');
  });
});
