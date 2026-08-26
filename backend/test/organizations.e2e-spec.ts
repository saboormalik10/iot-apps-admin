import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { User } from '../src/models/User';
import { InviteToken } from '../src/models/InviteToken';

// Don't hit real SMTP when inviting users during tests.
jest.mock('../src/utils/mailer', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Month 4 — organization + user management (`/organizations/me/...`).
 * Relies on the seeded admin + viewer accounts.
 */
describe('Organizations / user management (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let adminToken: string;
  let viewerToken: string;
  let adminUserId: string;
  const invitedEmail = `invitee-${Date.now()}@observator.com`;
  let invitedUserId: string;

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
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    adminToken = admin.body.data?.accessToken ?? admin.body.accessToken;

    const viewer = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'viewer@observator.com', password: process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234' });
    viewerToken = viewer.body.data?.accessToken ?? viewer.body.accessToken;

    const me = await request(httpServer).get('/v1/users/me').set('Authorization', `Bearer ${adminToken}`);
    adminUserId = me.body.data.id;
  });

  afterAll(async () => {
    if (invitedUserId) {
      await InviteToken.deleteMany({ userId: new mongoose.Types.ObjectId(invitedUserId) });
      await User.deleteOne({ _id: new mongoose.Types.ObjectId(invitedUserId) });
    }
    await app?.close();
    await mongoose.disconnect();
  });

  it('GET /v1/organizations/me → returns the org', async () => {
    const res = await request(httpServer).get('/v1/organizations/me').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.name).toBe('string');
  });

  it('GET /v1/organizations/me/users as admin → lists users', async () => {
    const res = await request(httpServer).get('/v1/organizations/me/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((u: { email: string }) => u.email === 'admin@observator.com')).toBe(true);
  });

  it('GET /v1/organizations/me/users as viewer → 403', async () => {
    const res = await request(httpServer).get('/v1/organizations/me/users').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /v1/organizations/me/users/invite as viewer → 403', async () => {
    const res = await request(httpServer)
      .post('/v1/organizations/me/users/invite')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ email: 'nope@observator.com', role: 'viewer' });
    expect(res.status).toBe(403);
  });

  it('POST /v1/organizations/me/users/invite as admin → 201, creates inactive user', async () => {
    const res = await request(httpServer)
      .post('/v1/organizations/me/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: invitedEmail, role: 'operator', firstName: 'New', lastName: 'Hire' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(invitedEmail);
    expect(res.body.data.user.isActive).toBe(false);
    invitedUserId = res.body.data.user.id;
  });

  it("PATCH /v1/organizations/me/users/:id as admin → changes a user's role", async () => {
    const res = await request(httpServer)
      .patch(`/v1/organizations/me/users/${invitedUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('viewer');
  });

  it('PATCH /v1/organizations/me/users/:id on self → 400', async () => {
    const res = await request(httpServer)
      .patch(`/v1/organizations/me/users/${adminUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });
    expect(res.status).toBe(400);
  });
});
