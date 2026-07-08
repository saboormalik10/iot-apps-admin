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
      .send({ email: 'admin@observator.com', password: 'Admin@1234' });
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
});
