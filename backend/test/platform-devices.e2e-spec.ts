import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * M25 — the cross-customer stations list.
 *
 * The Stations screen shows the owning customer and can filter by it, which needs
 * a list that spans tenants. `GET /devices` was deliberately NOT widened: a
 * tenant-scoped list that opens up on a role check is how cross-tenant leaks
 * happen. This lives behind `SuperAdminGuard` instead, so the tenancy boundary is
 * one greppable symbol rather than a condition inside a shared query.
 *
 * These tests exist mainly to hold that line.
 */
jest.setTimeout(120_000);

describe('platform stations list (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let superToken: string;
  let adminToken: string;
  let viewerToken: string;

  const login = async (email: string, fallback: string) => {
    const res = await request(http).post('/v1/auth/login').send({
      email,
      password: process.env[fallback] ?? 'Admin@1234',
    });
    return res.body.data?.accessToken as string;
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    superToken = await login('superadmin@observator.com', 'E2E_ADMIN_PASSWORD');
    adminToken = await login('admin@observator.com', 'E2E_ADMIN_PASSWORD');
    viewerToken = await login('viewer@observator.com', 'E2E_VIEWER_PASSWORD');
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('gives a platform admin every customer’s stations, each naming its owner', async () => {
    const res = await request(http).get('/v1/platform/devices').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const d of res.body.data) expect(typeof d.organizationName).toBe('string');

    // The point of the endpoint: more than one tenant in one response.
    const owners = new Set(res.body.data.map((d: { organizationName: string }) => d.organizationName));
    expect(owners.size).toBeGreaterThan(1);
  });

  it('filters to a single customer', async () => {
    const all = await request(http).get('/v1/platform/devices').set('Authorization', `Bearer ${superToken}`);
    const first = all.body.data[0];
    if (!first) return;

    const res = await request(http)
      .get(`/v1/platform/devices?organizationId=${first.organizationId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const owners = new Set(res.body.data.map((d: { organizationName: string }) => d.organizationName));
    expect([...owners]).toEqual([first.organizationName]);
    expect(res.body.meta.total).toBeLessThanOrEqual(all.body.meta.total);
  });

  it('offers only customers that actually own a station', async () => {
    const res = await request(http).get('/v1/platform/device-customers').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const devices = await request(http).get('/v1/platform/devices?limit=100').set('Authorization', `Bearer ${superToken}`);
    const owners = new Set(devices.body.data.map((d: { organizationName: string }) => d.organizationName));
    // A filter option with nothing behind it is a dead end.
    for (const c of res.body.data) expect(owners.has(c.name)).toBe(true);
  });

  it('refuses an organisation admin — this is the tenancy boundary', async () => {
    for (const path of ['/v1/platform/devices', '/v1/platform/device-customers']) {
      const res = await request(http).get(path).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('refuses a viewer', async () => {
    const res = await request(http).get('/v1/platform/devices').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('leaves GET /devices scoped to one organisation', async () => {
    // The whole design rests on this staying true.
    const res = await request(http).get('/v1/devices?limit=100').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const d of res.body.data) expect(d.organizationName).toBeUndefined();
  });
});
