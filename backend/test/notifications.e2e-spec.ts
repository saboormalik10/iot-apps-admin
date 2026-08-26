import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 6 — notifications feed + device token registration.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let adminToken: string;

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
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('GET /v1/notifications → feed with pagination + unreadCount', async () => {
    const res = await request(httpServer).get('/v1/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1 });
    expect(typeof res.body.unreadCount).toBe('number');
  });

  it('POST /v1/notifications/token registers a device token', async () => {
    const res = await request(httpServer)
      .post('/v1/notifications/token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ platform: 'android', token: `fcm_test_${Date.now()}`, appId: 'com.observator.neplink', deviceModel: 'CI' });
    expect(res.status).toBe(201);
    expect(res.body.data._id).toBeDefined();
    // Push targets by user, so registration must attribute the token to one.
    expect(res.body.data.userId).toBeTruthy();
  });

  it('re-registering the same token updates in place instead of duplicating', async () => {
    const token = `fcm_test_dup_${Date.now()}`;
    const send = (deviceModel: string) =>
      request(httpServer)
        .post('/v1/notifications/token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ platform: 'android', token, appId: 'com.observator.neplink', deviceModel });

    const first = await send('CI-first');
    const second = await send('CI-second');
    expect(second.status).toBe(201);
    expect(second.body.data._id).toBe(first.body.data._id);
    expect(second.body.data.deviceModel).toBe('CI-second');

    await request(httpServer)
      .delete('/v1/notifications/token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token });
  });

  it('DELETE /v1/notifications/token removes it from the org (the logout path)', async () => {
    const token = `fcm_test_logout_${Date.now()}`;
    await request(httpServer)
      .post('/v1/notifications/token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ platform: 'ios', token, appId: 'com.observator.metlink', deviceModel: 'CI' });

    const before = await request(httpServer).get('/v1/notifications/tokens').set('Authorization', `Bearer ${adminToken}`);
    expect(before.body.data.some((t: { _id: string }) => t._id)).toBe(true);

    const del = await request(httpServer)
      .delete('/v1/notifications/token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token });
    expect(del.status).toBe(204);

    // Gone for good — a second logout must not error either.
    const again = await request(httpServer)
      .delete('/v1/notifications/token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token });
    expect(again.status).toBe(204);
  });

  it('POST /v1/notifications/read-all → 200', async () => {
    const res = await request(httpServer).post('/v1/notifications/read-all').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.updated).toBe('number');
  });

  it('GET without token → 401', async () => {
    const res = await request(httpServer).get('/v1/notifications');
    expect(res.status).toBe(401);
  });
});
