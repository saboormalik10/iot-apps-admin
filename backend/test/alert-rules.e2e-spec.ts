import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 6 — alert-rules CRUD.
 *
 * SKIPPED: alerts are switched off (product decision) — `AlertRulesModule` is
 * unregistered in app.module.ts, so every `/v1/alert-rules` route returns 404
 * and nothing evaluates thresholds. The suite is left intact and unmodified;
 * change `describe.skip` back to `describe` when the module is re-registered.
 */
describe.skip('Alert rules (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let adminToken: string;
  let deviceId: string | undefined;
  let ruleId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();

    const admin = await request(httpServer).post('/v1/auth/login').send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    adminToken = admin.body.data?.accessToken ?? admin.body.accessToken;

    const devices = await request(httpServer).get('/v1/devices').query({ type: 'NEP-LINK' }).set('Authorization', `Bearer ${adminToken}`);
    deviceId = devices.body.data?.[0]?._id;
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/alert-rules creates a rule', async () => {
    const res = await request(httpServer)
      .post('/v1/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test turbidity', deviceId, appType: 'NEP', sensor: 'turbidity', condition: 'gt', threshold: 500, unit: 'NTU' });
    expect(res.status).toBe(201);
    expect(res.body.data._id).toBeDefined();
    ruleId = res.body.data._id;
  });

  it('GET /v1/alert-rules → paginated', async () => {
    const res = await request(httpServer).get('/v1/alert-rules').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1 });
  });

  it('PATCH /v1/alert-rules/:id toggles isActive', async () => {
    const res = await request(httpServer).patch(`/v1/alert-rules/${ruleId}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('POST with invalid deviceId → 400', async () => {
    const res = await request(httpServer)
      .post('/v1/alert-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', deviceId: 'not-an-id', appType: 'NEP', sensor: 'turbidity', condition: 'gt', threshold: 1, unit: 'NTU' });
    expect(res.status).toBe(400);
  });

  it('DELETE /v1/alert-rules/:id → 204', async () => {
    const res = await request(httpServer).delete(`/v1/alert-rules/${ruleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it('GET without token → 401', async () => {
    const res = await request(httpServer).get('/v1/alert-rules');
    expect(res.status).toBe(401);
  });
});
