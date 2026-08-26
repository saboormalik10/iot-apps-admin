import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 6 — share links + unauthenticated public view.
 *
 * Re-pointed at a MET record in M23 W4. It was written against a NEP session,
 * and NEP was switched off in M15 W4 — so `GET /dashboard/nep/sessions` had been
 * 404ing, `resourceId` arrived undefined and every assertion here failed on a
 * validation error. The suite was red for the wrong reason, which meant the
 * branded public page shipped in M20 W4 with no e2e cover at all.
 *
 * MET is the only live resource type, so it is the one worth guarding.
 */
describe('Share links + public view (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let adminToken: string;
  let recordId: string | undefined;
  let shareId: string;
  let token: string;

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

    const records = await request(httpServer)
      .get('/v1/records?limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    recordId = records.body.data?.[0]?._id;
    // Fail loudly here rather than letting every assertion below fail on a 400
    // from an undefined id — that is exactly how this suite hid a real gap.
    if (!recordId) throw new Error('No MET record available to share — seed one before running this suite.');
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/share creates a share link', async () => {
    const res = await request(httpServer)
      .post('/v1/share')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceType: 'metRecord', resourceId: recordId });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    token = res.body.data.token;
    shareId = res.body.data._id;
  });

  it('GET /v1/public/:token works WITHOUT auth', async () => {
    const res = await request(httpServer).get(`/v1/public/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.resourceType).toBe('metRecord');

    // The customer's identity must travel IN the payload: the recipient has no
    // session, so the page cannot call the authenticated branding endpoint.
    expect(res.body.data.branding).toBeDefined();
    expect(res.body.data.branding.displayName).toBeTruthy();

    // ...but never the support address. `branding.e2e-spec.ts` asserts this on
    // the service; this asserts it on the WIRE, which is what a stranger with a
    // forwarded link actually receives.
    expect(res.body.data.branding).not.toHaveProperty('supportEmail');
    expect(JSON.stringify(res.body)).not.toContain('supportEmail');
  });

  it('DELETE /v1/share/:id revokes → public 404', async () => {
    const del = await request(httpServer).delete(`/v1/share/${shareId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const res = await request(httpServer).get(`/v1/public/${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /v1/share without a token → 401', async () => {
    const res = await request(httpServer).post('/v1/share').send({ resourceType: 'metRecord', resourceId: recordId });
    expect(res.status).toBe(401);
  });

  it('GET /v1/public/:token unknown token → 404', async () => {
    const res = await request(httpServer).get('/v1/public/shr_does_not_exist');
    expect(res.status).toBe(404);
  });
});
