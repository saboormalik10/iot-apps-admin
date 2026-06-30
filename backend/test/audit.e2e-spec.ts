import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Month 4 — audit-log read endpoint (`/audit`, admin only).
 */
describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();

    const admin = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: 'Admin@1234' });
    adminToken = admin.body.data?.accessToken ?? admin.body.accessToken;

    const viewer = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'viewer@observator.com', password: 'Viewer@1234' });
    viewerToken = viewer.body.data?.accessToken ?? viewer.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('GET /v1/audit as admin → paginated list', async () => {
    const res = await request(httpServer).get('/v1/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1 });
    expect(typeof res.body.pagination.total).toBe('number');
  });

  it('GET /v1/audit?limit=2 → respects limit', async () => {
    const res = await request(httpServer)
      .get('/v1/audit')
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  it('GET /v1/audit as viewer → 403', async () => {
    const res = await request(httpServer).get('/v1/audit').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});
