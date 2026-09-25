import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * A malformed id is a thing that does not exist — 404, never 500.
 *
 * Devices and records passed the raw path segment straight to
 * `new Types.ObjectId`, which throws on anything that is not 24 hex characters,
 * so `/devices/abc` answered 500. It surfaced when `/devices/firmware-status`
 * was removed: the path then fell through to `/devices/:id`.
 *
 * Uses the data created by `npm run seed`.
 */
describe('malformed ids (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
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

  const cases: Array<[string, string]> = [
    ['get', '/v1/devices/not-an-id'],
    ['get', '/v1/devices/not-an-id/health'],
    ['patch', '/v1/devices/not-an-id'],
    ['get', '/v1/devices/firmware-status'],
    ['get', '/v1/records/not-an-id'],
    ['get', '/v1/records/not-an-id/measures'],
    ['get', '/v1/records/not-an-id/series'],
    ['patch', '/v1/records/not-an-id'],
    ['delete', '/v1/records/not-an-id'],
  ];

  it.each(cases)('%s %s → 404', async (method, path) => {
    const res = await (request(http) as unknown as Record<string, (p: string) => request.Test>)
      [method](path)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
