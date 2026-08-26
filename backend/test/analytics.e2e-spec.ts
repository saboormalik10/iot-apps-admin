import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
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
  let nepDeviceId: string;
  let nepSessionId: string;

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

    const devices = await request(http).get('/v1/dashboard/devices').set('Authorization', `Bearer ${token}`);
    for (const d of devices.body) {
      if (d.type === 'MET-LINK') metDeviceId = d._id;
      if (d.type === 'NEP-LINK') nepDeviceId = d._id;
    }
    const sessions = await request(http)
      .get('/v1/dashboard/nep/sessions')
      .query({ deviceId: nepDeviceId })
      .set('Authorization', `Bearer ${token}`);
    nepSessionId = sessions.body.sessions?.[0]?.id;
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

  // §10.5 — QNH / QFE / GPS-altitude are now comparable analytics sensors.
  it.each(['qnh', 'qfe', 'gps_altitude'])('MET statistics accepts the %s sensor (§10.5)', async (sensor) => {
    const res = await request(http)
      .get('/v1/analytics/met/statistics')
      .query({ deviceId: metDeviceId, sensor })
      .set(auth());
    expect(res.status).toBe(200); // not 400 "Unknown sensor" → the map wiring works
    expect(res.body).toHaveProperty('median');
  });

  it('MET multi-sensor overlays the three §10.5 sensors', async () => {
    const res = await request(http)
      .get('/v1/analytics/met/multi-sensor')
      .query({ deviceId: metDeviceId, sensors: ['qnh', 'qfe', 'gps_altitude'] })
      .set(auth());
    expect(res.status).toBe(200);
  });

  it('NEP gps-density returns spatial cells', async () => {
    const res = await request(http)
      .get('/v1/analytics/nep/gps-density')
      .query({ deviceId: nepDeviceId, resolution: 'medium' })
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cells)).toBe(true);
  });

  it('NEP turbidity-temperature correlation returns pearsonR + scatter', async () => {
    const res = await request(http)
      .get('/v1/analytics/nep/turbidity-temperature-correlation')
      .query({ sessionId: nepSessionId })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pearsonR');
    expect(res.body).toHaveProperty('scatterPoints');
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

  it('NEP daily-summary returns an array', async () => {
    const res = await request(http)
      .get('/v1/analytics/nep/daily-summary')
      .query({ deviceId: nepDeviceId })
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('MET export-bulk CSV has a header row', async () => {
    const res = await request(http)
      .get('/v1/analytics/met/export-bulk')
      .query({ deviceId: metDeviceId, format: 'csv' })
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

  it('sync upload is idempotent (no duplicate session)', async () => {
    const id = randomUUID();
    const payload = {
      type: 'nep_session',
      sessionId: id,
      deviceId: nepDeviceId,
      deviceName: 'NEP-LINK-001',
      startTimestamp: Date.now(),
      timezoneName: 'Australia/Brisbane',
      timezoneOffset: 10,
      samples: [{ timestamp: Date.now(), turbidityValue: 42, temperatureValue: 19 }],
    };
    const first = await request(http).post('/v1/sync/upload').set(auth()).send(payload);
    const second = await request(http).post('/v1/sync/upload').set(auth()).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const list = await request(http).get('/v1/sessions').query({ deviceId: nepDeviceId }).set(auth());
    const matches = (list.body.data as Array<{ id: string }>).filter((s) => s.id === id);
    expect(matches.length).toBe(1);
  });

  it('cross-org isolation: unknown session id → 404', async () => {
    const res = await request(http)
      .get('/v1/analytics/nep/water-quality-summary')
      .query({ sessionId: randomUUID() })
      .set(auth());
    expect(res.status).toBe(404);
  });
});
