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
  let httpServer: unknown;
  let adminToken: string;

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
