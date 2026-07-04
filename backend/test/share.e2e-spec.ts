import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 6 — share links + unauthenticated public view.
 */
describe('Share links + public view (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let adminToken: string;
  let sessionId: string | undefined;
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

    const admin = await request(httpServer).post('/v1/auth/login').send({ email: 'admin@observator.com', password: 'Admin@1234' });
    adminToken = admin.body.data?.accessToken ?? admin.body.accessToken;

    const sessions = await request(httpServer).get('/v1/dashboard/nep/sessions').set('Authorization', `Bearer ${adminToken}`);
    sessionId = sessions.body.sessions?.[0]?.id;
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/share creates a share link', async () => {
    const res = await request(httpServer)
      .post('/v1/share')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceType: 'nepSession', resourceId: sessionId });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    token = res.body.data.token;
    shareId = res.body.data._id;
  });

  it('GET /v1/public/:token works WITHOUT auth', async () => {
    const res = await request(httpServer).get(`/v1/public/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.resourceType).toBe('nepSession');
  });

  it('DELETE /v1/share/:id revokes → public 404', async () => {
    const del = await request(httpServer).delete(`/v1/share/${shareId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const res = await request(httpServer).get(`/v1/public/${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /v1/share without a token → 401', async () => {
    const res = await request(httpServer).post('/v1/share').send({ resourceType: 'nepSession', resourceId: sessionId });
    expect(res.status).toBe(401);
  });

  it('GET /v1/public/:token unknown token → 404', async () => {
    const res = await request(httpServer).get('/v1/public/shr_does_not_exist');
    expect(res.status).toBe(404);
  });
});
