import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 5 — accounts on a site PC, where there is no email.
 *
 *  - an administrator sets a user's password; the user must then choose their own;
 *  - people may sign themselves up when the site allows it, pending approval;
 *  - a removed user cannot be brought back by editing them;
 *  - sign-in tells an account's state only to someone who knows its password.
 */
describe('User accounts on a site PC (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let adminToken: string;
  let viewerToken: string;
  let adminId: string;
  const stamp = Date.now();
  const email = (tag: string) => `acct-${tag}-${stamp}@observator.com`;
  /** This suite's users — removal tombstones the email, so they are tracked by id. */
  const created: string[] = [];

  const login = (e: string, password: string) => request(http).post('/v1/auth/login').send({ email: e, password });
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  async function createUser(tag: string, password = 'First@12345') {
    const res = await asAdmin(request(http).post('/v1/organizations/me/users')).send({
      email: email(tag),
      password,
      role: 'viewer',
    });
    expect(res.status).toBe(201);
    created.push(res.body.data.id);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // As in main.ts, so error codes reach the response the way the portal reads them.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    const admin = await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');
    adminToken = admin.body.data.accessToken;
    adminId = admin.body.data.user.id;
    const viewer = await login('viewer@observator.com', process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234');
    viewerToken = viewer.body.data.accessToken;
  });

  afterAll(async () => {
    delete process.env.STANDALONE_SELF_SIGNUP;
    const signedUp = await User.find({ email: new RegExp(`^acct-.*-${stamp}@`) }).select('_id').lean();
    const ids = [...created, ...signedUp.map((u) => String(u._id))];
    await AuditLog.deleteMany({ resourceId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await app?.close();
    await mongoose.disconnect();
  });

  describe('an administrator sets a password', () => {
    it('sets it, ends the user’s sessions, and makes them choose their own', async () => {
      const id = await createUser('reset');
      const before = await login(email('reset'), 'First@12345');
      expect(before.status).toBe(200);
      // The administrator chose this one too, so it must be replaced as well.
      expect(before.body.data.user.mustChangePassword).toBe(true);
      await request(http)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${before.body.data.accessToken}`)
        .send({ currentPassword: 'First@12345', newPassword: 'Chosen@12345' })
        .expect(200);

      const res = await asAdmin(request(http).post(`/v1/organizations/me/users/${id}/password`)).send({ password: 'Temp@12345' });
      expect(res.status).toBe(200);
      expect(res.body.data.mustChangePassword).toBe(true);

      // The old session is over…
      const refresh = await request(http).post('/v1/auth/refresh').send({ refreshToken: before.body.data.refreshToken });
      expect(refresh.status).toBe(401);
      // …the password they had chosen no longer works, and the new one says
      // "choose your own" again.
      expect((await login(email('reset'), 'Chosen@12345')).status).toBe(401);
      const after = await login(email('reset'), 'Temp@12345');
      expect(after.status).toBe(200);
      expect(after.body.data.user.mustChangePassword).toBe(true);

      // Choosing their own clears it.
      const change = await request(http)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${after.body.data.accessToken}`)
        .send({ currentPassword: 'Temp@12345', newPassword: 'Mine@123456' });
      expect(change.status).toBe(200);
      const mine = await login(email('reset'), 'Mine@123456');
      expect(mine.body.data.user.mustChangePassword).toBe(false);
    });

    it('never records the password in the audit log', async () => {
      const id = await createUser('audit');
      await asAdmin(request(http).post(`/v1/organizations/me/users/${id}/password`)).send({ password: 'Secret@98765' });
      const entries = await AuditLog.find({ resourceId: id }).lean();
      expect(entries.some((e) => e.changes && (e.changes as Record<string, unknown>).password === 'reset by an administrator')).toBe(true);
      expect(JSON.stringify(entries)).not.toContain('Secret@98765');
    });

    it('refuses your own account, a short password, a viewer, and a removed user', async () => {
      const self = await asAdmin(request(http).post(`/v1/organizations/me/users/${adminId}/password`)).send({ password: 'Whatever@123' });
      expect(self.status).toBe(400);

      const id = await createUser('refuse');
      const short = await asAdmin(request(http).post(`/v1/organizations/me/users/${id}/password`)).send({ password: 'short' });
      expect(short.status).toBe(400);

      const viewer = await request(http)
        .post(`/v1/organizations/me/users/${id}/password`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ password: 'Viewer@12345' });
      expect(viewer.status).toBe(403);

      expect((await asAdmin(request(http).delete(`/v1/organizations/me/users/${id}`))).status).toBe(204);
      const removed = await asAdmin(request(http).post(`/v1/organizations/me/users/${id}/password`)).send({ password: 'Again@12345' });
      expect(removed.status).toBe(404);
    });

    it('refuses to set the same password again on the profile', async () => {
      await createUser('same', 'Same@123456');
      const s = await login(email('same'), 'Same@123456');
      const res = await request(http)
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${s.body.data.accessToken}`)
        .send({ currentPassword: 'Same@123456', newPassword: 'Same@123456' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code ?? res.body.code).toBe('SAME_PASSWORD');
    });
  });

  it('a REMOVED user cannot be re-activated by editing them', async () => {
    const id = await createUser('zombie');
    expect((await asAdmin(request(http).delete(`/v1/organizations/me/users/${id}`))).status).toBe(204);
    const res = await asAdmin(request(http).patch(`/v1/organizations/me/users/${id}`)).send({ isActive: true });
    expect(res.status).toBe(404);
    const u = await User.findById(id).lean();
    expect(u!.isActive).toBe(false);
  });

  it('lists the role a user actually holds, by id and name', async () => {
    const res = await asAdmin(request(http).get('/v1/organizations/me/users'));
    const admin = res.body.data.find((u: { email: string }) => u.email === 'admin@observator.com');
    expect(admin.roleId).toEqual(expect.any(String));
    expect(admin.roleName).toEqual(expect.any(String));
    expect(admin).not.toHaveProperty('passwordHash');
  });

  describe('sign-in', () => {
    it('tells a deactivated account’s state only to someone with its password', async () => {
      const id = await createUser('suspended', 'Susp@123456');
      expect((await asAdmin(request(http).patch(`/v1/organizations/me/users/${id}`)).send({ isActive: false })).status).toBe(200);
      const wrong = await login(email('suspended'), 'Wrong@123456');
      expect(wrong.status).toBe(401);
      const right = await login(email('suspended'), 'Susp@123456');
      expect(right.status).toBe(403);
    });

    it('answers an unknown email exactly like a wrong password', async () => {
      const res = await login(email('nobody'), 'Whatever@123');
      expect(res.status).toBe(401);
      expect(res.body.error?.code ?? res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('self sign-up', () => {
    it('is off by default: the sign-in page is told so, and the route is not there', async () => {
      delete process.env.STANDALONE_SELF_SIGNUP;
      const opts = await request(http).get('/v1/auth/options');
      expect(opts.status).toBe(200);
      expect(opts.body.data).toEqual({ selfSignup: false, emailReset: expect.any(Boolean) });
      const res = await request(http).post('/v1/auth/signup').send({ email: email('off'), password: 'Signup@12345' });
      expect(res.status).toBe(404);
      expect(await User.exists({ email: email('off') })).toBeNull();
    });

    it('when on: the account waits, inactive, until an administrator approves it', async () => {
      process.env.STANDALONE_SELF_SIGNUP = 'true';
      expect((await request(http).get('/v1/auth/options')).body.data.selfSignup).toBe(true);

      const res = await request(http)
        .post('/v1/auth/signup')
        .send({ email: email('signup'), password: 'Signup@12345', firstName: 'Sam' });
      expect(res.status).toBe(202);

      const pending = await login(email('signup'), 'Signup@12345');
      expect(pending.status).toBe(403);
      expect(pending.body.error?.code ?? pending.body.code).toBe('ACCOUNT_PENDING');

      const list = await asAdmin(request(http).get('/v1/organizations/me/users'));
      const row = list.body.data.find((u: { email: string }) => u.email === email('signup'));
      expect(row).toMatchObject({ isActive: false, pendingApproval: true, role: 'viewer', firstName: 'Sam' });

      const approve = await asAdmin(request(http).patch(`/v1/organizations/me/users/${row.id}`)).send({ isActive: true });
      expect(approve.status).toBe(200);
      expect(approve.body.data.pendingApproval).toBe(false);
      const ok = await login(email('signup'), 'Signup@12345');
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.role).toBe('viewer');
    });

    it('answers the same for an email that already has an account, and changes nothing', async () => {
      process.env.STANDALONE_SELF_SIGNUP = 'true';
      const res = await request(http).post('/v1/auth/signup').send({ email: 'admin@observator.com', password: 'Takeover@123' });
      expect(res.status).toBe(202);
      const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
      expect(admin!.role).toBe('admin');
      expect(admin!.isActive).toBe(true);
      expect((await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234')).status).toBe(200);
    });

    it('refuses a short password', async () => {
      process.env.STANDALONE_SELF_SIGNUP = 'true';
      const res = await request(http).post('/v1/auth/signup').send({ email: email('short'), password: 'short' });
      expect(res.status).toBe(400);
    });
  });
});
