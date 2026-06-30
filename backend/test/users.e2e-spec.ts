import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';

/**
 * Month 4 — profile endpoints (`/users/me`).
 * Uses a throwaway user so seeded accounts are never mutated.
 */
describe('Users / profile (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let token: string;
  let testUserId: string;

  const EMAIL = `profile-test-${Date.now()}@observator.com`;
  const INITIAL_PASSWORD = 'Initial@1234';
  const NEW_PASSWORD = 'Changed@5678';

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });

    // Anchor the throwaway user to the seeded admin's organisation.
    const admin = await User.findOne({ email: 'admin@observator.com' });
    if (!admin) throw new Error('Seed first: admin@observator.com missing');

    const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 12);
    const created = await User.create({
      organizationId: admin.organizationId,
      email: EMAIL,
      passwordHash,
      firstName: 'Pat',
      lastName: 'Tester',
      role: 'viewer',
      isActive: true,
    });
    testUserId = (created._id as mongoose.Types.ObjectId).toString();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();

    const res = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: INITIAL_PASSWORD });
    token = res.body.data?.accessToken ?? res.body.accessToken;
  });

  afterAll(async () => {
    await RefreshToken.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
    await User.deleteOne({ _id: new mongoose.Types.ObjectId(testUserId) });
    await app?.close();
    await mongoose.disconnect();
  });

  it('GET /v1/users/me → returns own profile', async () => {
    const res = await request(httpServer).get('/v1/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(EMAIL);
    expect(res.body.data.role).toBe('viewer');
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('GET /v1/users/me without token → 401', async () => {
    const res = await request(httpServer).get('/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('PATCH /v1/users/me → updates name', async () => {
    const res = await request(httpServer)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Patricia' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Patricia');
  });

  it('PATCH /v1/users/me with wrong current password → 401', async () => {
    const res = await request(httpServer)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('PATCH /v1/users/me changes password → new password logs in', async () => {
    const change = await request(httpServer)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(200);

    const login = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(typeof (login.body.data?.accessToken ?? login.body.accessToken)).toBe('string');
  });
});
