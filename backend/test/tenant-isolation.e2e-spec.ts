import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';

/**
 * Customer creation and CROSS-TENANT ISOLATION (M19 W4).
 *
 * Two real customers are created through the API, each with its own station and
 * day record, and then every data endpoint is asked the same question: can one
 * customer see the other's rows? A single leak here is the worst defect this
 * platform can have, so the sweep is exhaustive rather than a spot check.
 */

jest.setTimeout(120_000);

const PASSWORD = 'Passw0rd!tenant';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let superToken: string;
  let stamp: number;

  const created: { orgId: string; email: string; token: string; deviceId: string }[] = [];

  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(http as never).post('/v1/auth/login').send({ email, password });
    return res.body?.data?.accessToken ?? '';
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Registered so the tests see the SAME `{ error: { code } }` envelope the
    // real server returns; without it a service error arrives in Nest's default
    // shape and an assertion on `error.code` silently passes on `undefined`.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    stamp = Date.now();
    superToken = await login('superadmin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');

    // Two customers, created the way a platform administrator would.
    for (const tag of ['alpha', 'beta']) {
      const email = `iso-${tag}-${stamp}@test.invalid`;
      const res = await request(http as never)
        .post('/v1/platform/customers')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: `Iso ${tag} ${stamp}`,
          timezone: 'Australia/Sydney',
          admin: { email, password: PASSWORD, firstName: 'Iso', lastName: tag },
        });
      expect(res.status).toBe(201);

      const orgId = res.body.data.organizationId as string;
      // Give each one a station and a day of readings, so "empty" cannot be
      // mistaken for "isolated".
      const device = await Device.create({
        organizationId: new Types.ObjectId(orgId),
        name: `Iso Station ${tag} ${stamp}`,
        type: 'MET-LINK',
        bleId: `iso-${tag}-${stamp}`,
        lastSeenAt: new Date(),
      });
      await MetRecord.create({
        organizationId: new Types.ObjectId(orgId),
        deviceId: device._id,
        deviceName: device.name,
        dateStart: new Date().toISOString(),
        dateStartMs: Date.now() - 3_600_000,
        dateEndMs: Date.now(),
        measureCount: 10,
        source: 'sftp',
      });

      created.push({ orgId, email, token: await login(email, PASSWORD), deviceId: String(device._id) });
    }
  });

  afterAll(async () => {
    const orgIds = created.map((c) => new Types.ObjectId(c.orgId));
    await MetRecord.deleteMany({ organizationId: { $in: orgIds } });
    await Device.deleteMany({ organizationId: { $in: orgIds } });
    await User.deleteMany({ organizationId: { $in: orgIds } });
    await Organization.deleteMany({ _id: { $in: orgIds } });
    await app?.close();
    await mongoose.disconnect();
  });

  describe('customer creation', () => {
    it('creates an administrator who can sign in immediately — no invite', () => {
      expect(created[0].token).toMatch(/^eyJ/);
      expect(created[1].token).toMatch(/^eyJ/);
    });

    it('gives that administrator a real role, not just a legacy key', async () => {
      const user = await User.findOne({ email: created[0].email }).select('role roleId').lean();
      expect(user!.role).toBe('admin');
      // Without roleId they could not hold a custom role and would be invisible
      // to the role-usage counts that make deletion safe.
      expect(user!.roleId).toBeTruthy();
    });

    it('records an upload folder, since routing is by folder', async () => {
      const org = await Organization.findById(created[0].orgId).select('uploadFolder').lean();
      expect(org!.uploadFolder).toBe(`Iso alpha ${stamp}`);
    });

    it('refuses a folder that would collide with another customer', async () => {
      const res = await request(http as never)
        .post('/v1/platform/customers')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: `Iso clash ${stamp}`,
          uploadFolder: `Iso alpha ${stamp}`,
          admin: { email: `clash-${stamp}@test.invalid`, password: PASSWORD, firstName: 'C', lastName: 'L' },
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_FOLDER');
    });

    it('leaves no orphan organisation when the administrator cannot be created', async () => {
      const name = `Iso rollback ${stamp}`;
      const res = await request(http as never)
        .post('/v1/platform/customers')
        .set('Authorization', `Bearer ${superToken}`)
        // An email that already exists fails AFTER the organisation is built.
        .send({ name, admin: { email: created[0].email, password: PASSWORD, firstName: 'R', lastName: 'B' } });
      expect(res.status).toBe(400);
      expect(await Organization.findOne({ name }).lean()).toBeNull();
    });
  });

  describe('a customer cannot see another customer’s data', () => {
    // Every list endpoint a customer admin may call.
    const LIST_ENDPOINTS = [
      '/v1/devices',
      '/v1/records',
      '/v1/alert-rules',
      '/v1/share',
      '/v1/notifications',
      '/v1/organizations/me/users',
      '/v1/audit-logs',
    ];

    it.each(LIST_ENDPOINTS)('%s returns only its own rows', async (path) => {
      const res = await request(http as never).get(path).set('Authorization', `Bearer ${created[0].token}`);
      // 404 is acceptable for an endpoint this build does not expose; a 200 with
      // another tenant's rows is not.
      if (res.status === 404) return;
      expect(res.status).toBeLessThan(400);

      const rows = res.body?.data?.rows ?? res.body?.data ?? [];
      const body = JSON.stringify(rows);
      expect(body).not.toContain(created[1].orgId);
      expect(body).not.toContain(created[1].deviceId);
      expect(body).not.toContain(`Iso Station beta ${stamp}`);
    });

    it('cannot fetch another customer’s device by id', async () => {
      const res = await request(http as never)
        .get(`/v1/devices/${created[1].deviceId}`)
        .set('Authorization', `Bearer ${created[0].token}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('cannot modify another customer’s device', async () => {
      const res = await request(http as never)
        .patch(`/v1/devices/${created[1].deviceId}`)
        .set('Authorization', `Bearer ${created[0].token}`)
        .send({ name: 'hijacked' });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const device = await Device.findById(created[1].deviceId).select('name').lean();
      expect(device!.name).not.toBe('hijacked');
    });

    it('cannot delete another customer’s device', async () => {
      const res = await request(http as never)
        .delete(`/v1/devices/${created[1].deviceId}`)
        .set('Authorization', `Bearer ${created[0].token}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await Device.findById(created[1].deviceId).lean()).not.toBeNull();
    });
  });

  describe('a customer cannot reach the platform surface', () => {
    it.each([
      ['GET', '/v1/platform/overview'],
      ['GET', '/v1/organizations'],
    ])('%s %s is forbidden', async (method, path) => {
      const res = await request(http as never)
        [method.toLowerCase() as 'get'](path)
        .set('Authorization', `Bearer ${created[0].token}`);
      expect(res.status).toBe(403);
    });

    it('cannot create a customer', async () => {
      const res = await request(http as never)
        .post('/v1/platform/customers')
        .set('Authorization', `Bearer ${created[0].token}`)
        .send({ name: 'Sneaky', admin: { email: 'x@test.invalid', password: PASSWORD, firstName: 'S', lastName: 'N' } });
      expect(res.status).toBe(403);
    });

    it('cannot switch into another organisation', async () => {
      const res = await request(http as never)
        .post('/v1/auth/switch-org')
        .set('Authorization', `Bearer ${created[0].token}`)
        .send({ organizationId: created[1].orgId });
      expect(res.status).toBe(403);
    });
  });

  describe('a platform administrator switched into a customer sees only that customer', () => {
    it('sees the customer’s station, and not the other customer’s', async () => {
      const sw = await request(http as never)
        .post('/v1/auth/switch-org')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ organizationId: created[0].orgId });
      expect(sw.status).toBe(200);

      const res = await request(http as never)
        .get('/v1/devices')
        .set('Authorization', `Bearer ${sw.body.data.accessToken}`);
      const body = JSON.stringify(res.body?.data ?? {});
      expect(body).toContain(`Iso Station alpha ${stamp}`);
      expect(body).not.toContain(`Iso Station beta ${stamp}`);
    });
  });
});
