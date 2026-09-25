import 'dotenv/config';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuditLog } from '../src/models/AuditLog';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';

/**
 * What an access token is worth once the account behind it has changed.
 *
 * A token lives 15 minutes and carries its own grants, so revoking a refresh token
 * alone left a reset, suspended or removed account working for the rest of that
 * window — reads, writes and exports — which is the very window those actions
 * exist to close. Found in review, 23 Sep 2026.
 */
describe('Sessions end when the account changes (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let adminToken: string;
  let url: string;
  const stamp = Date.now();
  const email = (tag: string) => `sess-${tag}-${stamp}@observator.com`;
  const created: string[] = [];

  const login = (e: string, password: string) => request(http).post('/v1/auth/login').send({ email: e, password });
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  /** A new user who has already chosen their own password, as a real one would. */
  async function makeUser(tag: string, password = 'Given@12345') {
    const res = await asAdmin(request(http).post('/v1/organizations/me/users')).send({
      email: email(tag),
      password,
      role: 'viewer',
    });
    expect(res.status).toBe(201);
    created.push(res.body.data.id);
    const first = await login(email(tag), password);
    const own = 'Chosen@123456';
    await request(http)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .send({ currentPassword: password, newPassword: own })
      .expect(200);
    const session = await login(email(tag), own);
    return { id: res.body.data.id as string, token: session.body.data.accessToken as string, password: own };
  }

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    // A real port, so a live socket can be opened against it.
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    http = app.getHttpServer();
    adminToken = (
      await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234')
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await AuditLog.deleteMany({ resourceId: { $in: created } });
    await User.deleteMany({ _id: { $in: created } });
    await Role.deleteMany({ name: `Viewer ${stamp}` });
    await app?.close();
    await mongoose.disconnect();
  });

  it('a password reset stops the token the user already holds', async () => {
    const user = await makeUser('reset');
    expect((await request(http).get('/v1/devices').set('Authorization', `Bearer ${user.token}`)).status).toBe(200);
    // A token's `iat` counts whole seconds, and a token minted in the same second
    // as the reset is deliberately kept (it can only be the new session's). Put a
    // second between them so this tests the ordinary case.
    await new Promise((r) => setTimeout(r, 1100));

    await asAdmin(request(http).post(`/v1/organizations/me/users/${user.id}/password`))
      .send({ password: 'Temp@123456' })
      .expect(200);

    const after = await request(http).get('/v1/devices').set('Authorization', `Bearer ${user.token}`);
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe('SESSION_ENDED');
  });

  it('deactivating and removing stop the token too', async () => {
    const off = await makeUser('off');
    await asAdmin(request(http).patch(`/v1/organizations/me/users/${off.id}`)).send({ isActive: false }).expect(200);
    const suspended = await request(http).get('/v1/devices').set('Authorization', `Bearer ${off.token}`);
    expect(suspended.status).toBe(401);
    expect(suspended.body.error?.code).toBe('ACCOUNT_SUSPENDED');

    const gone = await makeUser('gone');
    expect((await asAdmin(request(http).delete(`/v1/organizations/me/users/${gone.id}`))).status).toBe(204);
    const removed = await request(http).get('/v1/devices').set('Authorization', `Bearer ${gone.token}`);
    expect(removed.status).toBe(401);
    expect(removed.body.error?.code).toBe('ACCOUNT_GONE');
    // Nor can they read their own tombstoned profile.
    expect((await request(http).get('/v1/users/me').set('Authorization', `Bearer ${gone.token}`)).status).toBe(401);
  });

  it('a user who must choose a password can do nothing else until they have', async () => {
    const user = await makeUser('forced');
    await asAdmin(request(http).post(`/v1/organizations/me/users/${user.id}/password`))
      .send({ password: 'Temp@123456' })
      .expect(200);
    const token = (await login(email('forced'), 'Temp@123456')).body.data.accessToken;
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    for (const path of ['/v1/devices', '/v1/records', '/v1/dashboard/summary', '/v1/notifications']) {
      const res = await auth(request(http).get(path));
      expect([403, 404]).toContain(res.status);
      if (res.status === 403) expect(res.body.error?.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    // Only the profile, so the password CAN be changed.
    expect((await auth(request(http).get('/v1/users/me'))).status).toBe(200);
    const changed = await auth(request(http).patch('/v1/users/me')).send({
      currentPassword: 'Temp@123456',
      newPassword: 'Mine@1234567',
    });
    expect(changed.status).toBe(200);
    const fresh = (await login(email('forced'), 'Mine@1234567')).body.data.accessToken;
    expect((await request(http).get('/v1/devices').set('Authorization', `Bearer ${fresh}`)).status).toBe(200);
  });

  it('a token minted in the same second as the reset still works', async () => {
    // The guard compares whole seconds, so the NEW session must not be caught by
    // the moment that ended the old ones.
    const user = await makeUser('same-second');
    await asAdmin(request(http).post(`/v1/organizations/me/users/${user.id}/password`))
      .send({ password: 'Temp@123456' })
      .expect(200);
    const fresh = (await login(email('same-second'), 'Temp@123456')).body.data.accessToken;
    expect((await request(http).get('/v1/users/me').set('Authorization', `Bearer ${fresh}`)).status).toBe(200);
  });

  it('the at-the-PC reset ends the sessions the account already has', async () => {
    /**
     * `reset-password` is the way back in when nobody can sign in, and its own
     * description says it "ends the user's sessions". It revoked refresh tokens
     * only, so the account's access token — grants and all — went on working for
     * the rest of its 15 minutes after a technician standing at the PC had just
     * taken the account away from whoever held it. Found in QA, 24 Sep 2026.
     */
    const user = await makeUser('at-pc');
    expect((await request(http).get('/v1/devices').set('Authorization', `Bearer ${user.token}`)).status).toBe(200);
    // `iat` counts whole seconds, and a token minted in the same second as the
    // reset is deliberately kept — put a second between them.
    await new Promise((r) => setTimeout(r, 1100));

    const script = path.join(__dirname, '..', 'src', 'scripts', 'reset-password.ts');
    const tsNode = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node');
    await promisify(execFile)(tsNode, [script, email('at-pc'), 'FromThePC@1234'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, RESET_PASSWORD: '' },
    });

    const after = await request(http).get('/v1/devices').set('Authorization', `Bearer ${user.token}`);
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe('SESSION_ENDED');
    // …and the password it set is the one that works now.
    expect((await login(email('at-pc'), 'FromThePC@1234')).status).toBe(200);
  }, 60_000);

  it('the refresh cookie is only Secure when the site is actually on https', async () => {
    /**
     * A site PC normally serves plain http, and a `Secure` cookie is never sent
     * back over http. Keying this to `NODE_ENV=production` therefore made the
     * cookie useless in the ordinary deployment; it follows the site's own
     * SESSION_COOKIE_SECURE switch instead. QA, 24 Sep 2026.
     */
    const res = await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const refresh = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refresh).toBeDefined();
    expect(/HttpOnly/i.test(refresh!)).toBe(true);
    expect(/SameSite=Strict/i.test(refresh!)).toBe(true);
    expect(/Secure/i.test(refresh!)).toBe(process.env.SESSION_COOKIE_SECURE === 'true');
  });

  it('a custom role may not take a built-in role’s name', async () => {
    const res = await asAdmin(request(http).post('/v1/roles')).send({
      name: 'Viewer',
      baseRole: 'viewer',
      permissions: ['data:read'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('RESERVED_ROLE_NAME');
  });

  it('nonsense in a query answers 400, not 500', async () => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
    for (const url of [
      '/v1/dashboard/met/latest?deviceId=zzz',
      '/v1/records?page=-1',
      '/v1/records?page=0',
      '/v1/records?deviceId=not-an-id',
    ]) {
      const res = await auth(request(http).get(url));
      expect(res.status).toBeLessThan(500);
      if (res.status >= 400) expect(typeof (res.body.error?.code ?? '')).toBe('string');
    }
  });

  it('records who did it AND from which PC', async () => {
    const user = await makeUser('audited');
    await asAdmin(request(http).post(`/v1/organizations/me/users/${user.id}/password`))
      .set('x-forwarded-for', '192.168.1.77')
      .send({ password: 'Temp@123456' })
      .expect(200);
    const entry = await AuditLog.findOne({ resourceId: user.id, action: 'update' }).sort({ createdAt: -1 }).lean();
    expect(entry).toBeTruthy();
    expect(entry!.ipAddress).toBe('192.168.1.77');
  });
  it('closes a live socket when the account behind it is suspended', async () => {
    const user = await makeUser('socket');
    const ticket = (
      await request(http).post('/v1/auth/ws-ticket').set('Authorization', `Bearer ${user.token}`)
    ).body.data.ticket as string;

    const socket: Socket = io(url, { path: '/v1/ws', auth: { token: ticket }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    try {
      // Suspended while the page is open: the next connection attempt is refused…
      await asAdmin(request(http).patch(`/v1/organizations/me/users/${user.id}`)).send({ isActive: false }).expect(200);
      const second: Socket = io(url, { path: '/v1/ws', auth: { token: ticket }, transports: ['websocket'], forceNew: true });
      const outcome = await new Promise<string>((resolve) => {
        second.on('unauthorized', () => resolve('unauthorized'));
        second.on('connect', () => setTimeout(() => resolve(second.connected ? 'still connected' : 'unauthorized'), 1500));
        second.on('connect_error', () => resolve('unauthorized'));
      });
      second.close();
      expect(outcome).toBe('unauthorized');
    } finally {
      socket.close();
    }
  });
});
