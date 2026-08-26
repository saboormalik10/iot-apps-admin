import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Core API integration tests: health, auth, guards, and the (DB-free)
 * unit-convert analytics utility. Requires MONGO_URI (Atlas) to boot.
 */
describe('Core API (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let accessToken: string;

  beforeAll(async () => {
    // Pre-connect the default Mongoose connection (generous timeout) so queries
    // are ready immediately — the app's 8s serverSelection can be tight here.
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/auth/login → returns access token', async () => {
    const res = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    expect(res.status).toBe(200);
    accessToken = res.body.data?.accessToken ?? res.body.accessToken;
    expect(typeof accessToken).toBe('string');
  });

  it('GET /v1/analytics/org/fleet-health without token → 401', async () => {
    const res = await request(httpServer).get('/v1/analytics/org/fleet-health');
    expect(res.status).toBe(401);
  });

  it('GET /v1/analytics/unit-convert m/s → Bft returns Beaufort label', async () => {
    const res = await request(httpServer)
      .get('/v1/analytics/unit-convert')
      .query({ value: 12.5, fromUnit: 'm/s', toUnit: 'Bft' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.toUnit).toBe('Bft');
    expect(typeof res.body.result).toBe('number');
    expect(typeof res.body.label).toBe('string');
  });
});
