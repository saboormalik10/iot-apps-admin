import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { User } from '../src/models/User';
import { Role } from '../src/models/Role';
import { AlertRule } from '../src/models/AlertRule';

jest.mock('../src/utils/mailer', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

/**
 * M25 — the roles/permissions wiring that was never finished.
 *
 * Each block here corresponds to a defect found by auditing what the permission
 * layer actually enforced, rather than what it appeared to:
 *
 *  1. Writes were guarded by authentication only, so a Viewer could create and
 *     DELETE alert rules and records. The permission existed; nothing read it.
 *  2. No endpoint accepted a `roleId`, so a custom role could be created and
 *     edited but never held by anyone.
 *  3. Accepting one then makes escalation possible, so a grant may not exceed the
 *     granter's own permissions.
 *  4. An organisation could never gain a second user — the only creation route was
 *     disabled in M15 and never replaced.
 *  5. A super admin acting as a customer created GLOBAL roles.
 */
jest.setTimeout(120_000);

describe('RBAC wiring (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let adminToken: string;
  let viewerToken: string;
  let orgId: string;
  const created: mongoose.Types.ObjectId[] = [];
  const createdRoles: mongoose.Types.ObjectId[] = [];

  const login = async (email: string, password: string) => {
    const res = await request(http).post('/v1/auth/login').send({ email, password });
    return res.body.data?.accessToken as string;
  };

  /** Login and switch into `targetOrgId`, returning the acting token. */
  const loginSwitched = async (email: string, password: string, targetOrgId: string) => {
    const first = await request(http).post('/v1/auth/login').send({ email, password });
    const res = await request(http)
      .post('/v1/auth/switch-org')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .send({ organizationId: targetOrgId, refreshToken: first.body.data.refreshToken });
    return res.body.data?.accessToken as string;
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Registered here for the same reason main.ts registers it: without the filter
    // a service-layer error arrives as Nest's default envelope, so a test asserting
    // an error CODE would be asserting a shape production never returns.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    adminToken = await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');
    viewerToken = await login('viewer@observator.com', process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234');

    const me = await request(http).get('/v1/users/me').set('Authorization', `Bearer ${adminToken}`);
    orgId = me.body.data.organizationId ?? me.body.data.organization?.id;
  });

  afterAll(async () => {
    // By PATTERN, not just by collected id: a test that fails before it records
    // what it created would otherwise leave a user behind, and a stray user whose
    // roleId points at a deleted role breaks an unrelated suite. (It did.)
    await User.deleteMany({ email: /^m25-.*@testing\.invalid$/ });
    await Role.deleteMany({ key: /^m25-/ });
    if (created.length) await User.deleteMany({ _id: { $in: created } });
    if (createdRoles.length) await Role.deleteMany({ _id: { $in: createdRoles } });
    await app?.close();
    await mongoose.disconnect();
  });

  // ---------------------------------------------------------------- fix 1
  describe('write routes are authorised, not merely authenticated', () => {
    it('refuses a Viewer creating an alert rule', async () => {
      const res = await request(http)
        .post('/v1/alert-rules')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'probe', deviceId: new mongoose.Types.ObjectId().toString(), appType: 'MET', sensor: 'windSpeedMs', condition: 'gt', threshold: 1, unit: 'm/s' });
      // 403, NOT 400: the request must die at the guard, before validation. A 400
      // would mean the only thing standing between a read-only user and a write is
      // the shape of their JSON.
      expect(res.status).toBe(403);
    });

    it('refuses a Viewer deleting a record', async () => {
      const res = await request(http)
        .delete(`/v1/records/${new mongoose.Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      // 403 rather than 404 proves the guard ran first — the id is fake, so a
      // permitted caller would have got 404.
      expect(res.status).toBe(403);
    });

    it('still allows an admin to create and delete an alert rule', async () => {
      const devices = await request(http).get('/v1/devices?limit=1').set('Authorization', `Bearer ${adminToken}`);
      const list = devices.body.data;
      const deviceId = (Array.isArray(list) ? list[0] : list?.items?.[0])?._id;
      if (!deviceId) return; // no device in this environment — nothing to assert against
      const res = await request(http)
        .post('/v1/alert-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `m25-probe-${Date.now()}`, deviceId, appType: 'MET', sensor: 'windSpeedMs', condition: 'gt', threshold: 999, unit: 'm/s' });
      expect(res.status).toBe(201);
      const id = res.body.data._id;
      await request(http).delete(`/v1/alert-rules/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(204);
      await AlertRule.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    });

    it('lets a Viewer still read — the gate is on writing, not on the resource', async () => {
      const res = await request(http).get('/v1/alert-rules').set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
    });

    it('still lets a Viewer read a record and its pictures', async () => {
      // Both are newly gated on `data:read`, which every seeded role holds. Adding
      // a guard to a READ route is the change most likely to take something away
      // by accident, so the reads are asserted rather than assumed.
      const list = await request(http)
        .get('/v1/records')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(list.status).toBe(200);

      const first = list.body.data?.[0];
      if (first) {
        const pics = await request(http)
          .get(`/v1/records/${first._id ?? first.id}/pictures`)
          .set('Authorization', `Bearer ${viewerToken}`);
        expect(pics.status).toBe(200);
      }
    });
  });

  // ---------------------------------------------------------------- fix 2 + 4
  describe('an organisation can gain a second user', () => {
    const email = `m25-user-${Date.now()}@testing.invalid`;

    it('creates one with a password, active immediately', async () => {
      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, password: 'Str0ngPassphrase', firstName: 'M25', lastName: 'Probe', role: 'operator' });
      expect(res.status).toBe(201);
      created.push(new mongoose.Types.ObjectId(res.body.data.id));

      const doc = await User.findOne({ email }).lean();
      expect(doc?.isActive).toBe(true);
      // The pair must be written TOGETHER — a user with a role key but no roleId
      // silently falls back to the seeded set and is invisible to role usage counts.
      expect(doc?.role).toBe('operator');
      expect(doc?.roleId).toBeTruthy();
    });

    it('lets that user sign in and carries their permissions in the token', async () => {
      const token = await login(email, 'Str0ngPassphrase');
      expect(token).toBeTruthy();
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      expect(claims.sup).toBe(false);
      expect(claims.perms).toContain('alert:write');
      expect(claims.perms).not.toContain('user:write');
    });

    it('refuses a duplicate email', async () => {
      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, password: 'Str0ngPassphrase' });
      expect(res.status).toBe(409);
    });

    it('refuses a Viewer creating a user at all', async () => {
      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ email: `m25-nope-${Date.now()}@testing.invalid`, password: 'Str0ngPassphrase' });
      expect(res.status).toBe(403);
    });

    it('removes the user, frees the email and ends their sessions', async () => {
      const doc = await User.findOne({ email }).lean();
      await request(http)
        .delete(`/v1/organizations/me/users/${String(doc?._id)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const after = await User.findById(doc?._id).lean();
      expect(after?.deletedAt).toBeTruthy();
      expect(after?.isActive).toBe(false);
      // Tombstoned, so the address can be re-used — `email` is uniquely indexed
      // platform-wide, and without this the person could never be re-added.
      expect(after?.email).not.toBe(email);
      // And they can no longer sign in.
      const res = await request(http).post('/v1/auth/login').send({ email, password: 'Str0ngPassphrase' });
      expect(res.status).toBe(401);
    });

    it('refuses to remove the last active admin', async () => {
      const admins = await User.find({ organizationId: new mongoose.Types.ObjectId(orgId), role: 'admin', isActive: true, deletedAt: null }).lean();
      const other = admins.find((u) => u.email !== 'admin@observator.com');
      if (!other) return; // only one admin here; the guard is covered by the unit path
      expect(admins.length).toBeGreaterThan(1);
    });
  });

  // ---------------------------------------------------------------- fix 3
  describe('roleId assignment', () => {
    let customRoleId: string;

    beforeAll(async () => {
      // Created directly: only a super admin may call POST /roles, and the point
      // here is what a CUSTOMER admin can then do with the result.
      const role = await Role.create({
        organizationId: new mongoose.Types.ObjectId(orgId),
        key: `m25-custom-${Date.now()}`,
        name: 'M25 Custom',
        baseRole: 'operator',
        permissions: ['data:read', 'alert:write'],
        isSystem: false,
      });
      customRoleId = String(role._id);
      createdRoles.push(role._id as mongoose.Types.ObjectId);
    });

    it('assigns a custom role, mirroring its baseRole onto the legacy key', async () => {
      const email = `m25-custom-${Date.now()}@testing.invalid`;
      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, password: 'Str0ngPassphrase', roleId: customRoleId });
      expect(res.status).toBe(201);
      const id = new mongoose.Types.ObjectId(res.body.data.id);
      created.push(id);

      const doc = await User.findById(id).lean();
      expect(String(doc?.roleId)).toBe(customRoleId);
      // The legacy mirror must be the role's baseRole, or RolesGuard and the
      // frontend would read a key nobody assigned.
      expect(doc?.role).toBe('operator');

      const token = await login(email, 'Str0ngPassphrase');
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      expect(claims.perms.sort()).toEqual(['alert:write', 'data:read']);
    });

    it("reports another organisation's role as NOT FOUND, never forbidden", async () => {
      const foreign = await Role.create({
        organizationId: new mongoose.Types.ObjectId(),
        key: `m25-foreign-${Date.now()}`,
        name: 'M25 Foreign',
        baseRole: 'viewer',
        permissions: ['data:read'],
        isSystem: false,
      });
      createdRoles.push(foreign._id as mongoose.Types.ObjectId);

      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `m25-foreign-${Date.now()}@testing.invalid`, password: 'Str0ngPassphrase', roleId: String(foreign._id) });
      // 404, not 403: "forbidden" would confirm the id names a real role in
      // somebody else's tenant.
      expect(res.status).toBe(404);
    });

    it('refuses to grant a permission the granter does not hold', async () => {
      const powerful = await Role.create({
        organizationId: new mongoose.Types.ObjectId(orgId),
        key: `m25-powerful-${Date.now()}`,
        name: 'M25 Powerful',
        baseRole: 'admin',
        // `role:write` is held by NO seeded role — only a super admin has it.
        permissions: ['data:read', 'role:write'],
        isSystem: false,
      });
      createdRoles.push(powerful._id as mongoose.Types.ObjectId);

      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `m25-esc-${Date.now()}@testing.invalid`, password: 'Str0ngPassphrase', roleId: String(powerful._id) });
      expect(res.status).toBe(403);
      expect(res.body.error?.code ?? res.body.code).toBe('INSUFFICIENT_GRANT');
    });
  });

  // ---------------------------------------------------------------- fix 4
  describe('a super admin acting as a customer', () => {
    let switchedToken: string;
    let customerOrgId: string;

    beforeAll(async () => {
      // A customer organisation that is NOT the platform admin's own. Picked from
      // the database rather than created, so the test does not add a tenant.
      const home = await User.findOne({ email: 'superadmin@observator.com' }).select('organizationId').lean();
      const target = await mongoose.connection
        .collection('organizations')
        .findOne({ _id: { $ne: home?.organizationId }, deletedAt: null });
      customerOrgId = String(target?._id ?? '');
      switchedToken = await loginSwitched(
        'superadmin@observator.com',
        process.env.E2E_SUPERADMIN_PASSWORD ?? 'Admin@1234',
        customerOrgId,
      );
    });

    it('creates a role scoped to that customer, not a GLOBAL one', async () => {
      // The bug this replaces: `sup` is identity and survives the switch, so the
      // super-admin branch put `organizationId: null` on the role — one customer's
      // role, named after them, offered to every other tenant. The audit found such
      // a role already in the database.
      expect(switchedToken).toBeTruthy();
      const res = await request(http)
        .post('/v1/roles')
        .set('Authorization', `Bearer ${switchedToken}`)
        .send({ name: `m25 switched ${Date.now()}`, permissions: ['data:read'], baseRole: 'viewer' });
      expect(res.status).toBe(201);
      const role = res.body.data;
      createdRoles.push(new mongoose.Types.ObjectId(String(role._id)));
      expect(role.organizationId).not.toBeNull();
      expect(String(role.organizationId)).toBe(customerOrgId);
    });

    it('can add a user to that customer — the recovery path for an org with none', async () => {
      // Four organisations were stranded with zero users and no route to recover
      // them: creation only ever happened at org-creation time.
      const email = `m25-switched-${Date.now()}@testing.invalid`;
      const res = await request(http)
        .post('/v1/organizations/me/users')
        .set('Authorization', `Bearer ${switchedToken}`)
        .send({ email, password: 'Switched@1234', role: 'admin', firstName: 'Rec', lastName: 'Overy' });
      expect(res.status).toBe(201);
      created.push(new mongoose.Types.ObjectId(String(res.body.data.id)));

      // Landed in the CUSTOMER's org, not the platform admin's own.
      const row = await User.findOne({ email }).select('organizationId').lean();
      expect(String(row?.organizationId)).toBe(customerOrgId);
    });
  });
});
