import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Dashboard summary (e2e) — covers the §10.8 enrichment: the summary endpoint
 * now returns `activeAlertRules` and 14-day `sparklines` alongside the counts.
 * Uses the data created by `npm run seed`. Run the seed first.
 */
describe('Dashboard summary (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();

    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.accessToken ?? login.body.data?.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('returns the scalar counts plus §10.8 alert count + sparklines', async () => {
    const res = await request(http)
      .get('/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Existing scalar counts
    expect(res.body).toHaveProperty('totalDevices');
    expect(res.body).toHaveProperty('onlineDevices');
    expect(res.body).toHaveProperty('totalMetRecords');
    expect(res.body).toHaveProperty('totalNepSessions');
    expect(res.body).toHaveProperty('serverTime');

    // §10.8 enrichment
    expect(typeof res.body.activeAlertRules).toBe('number');
    expect(res.body.sparklines).toBeDefined();
    expect(Array.isArray(res.body.sparklines.records)).toBe(true);
    expect(Array.isArray(res.body.sparklines.sessions)).toBe(true);
    expect(res.body.sparklines.records).toHaveLength(14);
    expect(res.body.sparklines.sessions).toHaveLength(14);
    for (const n of [...res.body.sparklines.records, ...res.body.sparklines.sessions]) {
      expect(typeof n).toBe('number');
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects met/history-multi without a sensors list', async () => {
    // Need a deviceId to reach the sensor validation.
    const devices = await request(http)
      .get('/v1/dashboard/devices')
      .set('Authorization', `Bearer ${token}`);
    const anyDevice = (devices.body as Array<{ _id?: string; id?: string }>)[0];
    const deviceId = anyDevice?._id ?? anyDevice?.id ?? '000000000000000000000000';

    const res = await request(http)
      .get(`/v1/dashboard/met/history-multi?deviceId=${deviceId}&from=0&to=${Date.now()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('serves met/history-multi pre-aggregated (≤500 pts/sensor, adaptive bucket)', async () => {
    const devices = await request(http)
      .get('/v1/dashboard/devices')
      .set('Authorization', `Bearer ${token}`);
    const met = (devices.body as Array<{ _id?: string; id?: string; type?: string }>).find(
      (d) => d.type === 'MET-LINK',
    );
    if (!met) return; // no MET device seeded in this environment — nothing to assert

    const deviceId = met._id ?? met.id!;
    const sensors = 'wind_speed,temperature';
    const now = Date.now();

    // All-time window
    const wide = await request(http)
      .get(`/v1/dashboard/met/history-multi?deviceId=${deviceId}&sensors=${sensors}&from=0&to=${now}`)
      .set('Authorization', `Bearer ${token}`);

    expect(wide.status).toBe(200);
    expect(wide.body).toHaveProperty('series');
    expect(wide.body).toHaveProperty('bucketMs');
    expect(typeof wide.body.bucketMs).toBe('number');
    expect(wide.body.bucketMs).toBeGreaterThan(0);
    for (const sensor of sensors.split(',')) {
      expect(wide.body.series).toHaveProperty(sensor);
      const s = wide.body.series[sensor];
      expect(Array.isArray(s.data)).toBe(true);
      expect(s.data.length).toBeLessThanOrEqual(500); // the display cap — never ships raw rows
      if (s.data.length) {
        expect(s.data[0]).toHaveProperty('timestampMs');
        expect(s.data[0]).toHaveProperty('min');
        expect(s.data[0]).toHaveProperty('max');
        expect(s.data[0]).toHaveProperty('avg');
      }
    }

    // A 1-hour window must never bucket coarser than the all-time window.
    const narrow = await request(http)
      .get(
        `/v1/dashboard/met/history-multi?deviceId=${deviceId}&sensors=${sensors}&from=${now - 3_600_000}&to=${now}`,
      )
      .set('Authorization', `Bearer ${token}`);
    expect(narrow.status).toBe(200);
    expect(narrow.body.bucketMs).toBeLessThanOrEqual(wide.body.bucketMs);
  });
});
