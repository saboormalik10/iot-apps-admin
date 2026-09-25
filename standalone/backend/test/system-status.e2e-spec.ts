import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { SystemStatusService } from '../src/system/system-status.service';

/**
 * Phase 7 — the site PC's health: the portal's System page and status.cmd.
 */
describe('System status (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let adminToken: string;
  let service: SystemStatusService;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-sys-'));
  const previousDataDir = process.env.STANDALONE_DATA_DIR;

  const writeBackup = (o: object) => {
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'logs', 'backup-last.json'), JSON.stringify(o));
  };

  beforeAll(async () => {
    process.env.STANDALONE_DATA_DIR = dataDir;
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();
    service = app.get(SystemStatusService);
    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'viewer@observator.com', password: process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234' });
    token = login.body.data.accessToken;
    const adminLogin = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.STANDALONE_DATA_DIR;
    else process.env.STANDALONE_DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
    await app?.close();
    await mongoose.disconnect();
  });

  it('/health carries the sensor line status.cmd prints', async () => {
    const res = await request(http).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.stream).toEqual(
      expect.objectContaining({ enabled: expect.any(Boolean), mode: expect.any(String), connected: expect.any(Boolean), readingsLastMinute: expect.any(Number) }),
    );
  });

  it('needs a signed-in user, and the permission to look', async () => {
    // The page names the data folder, the database size and where the sensor
    // connects from — the shape of the PC, not the weather. QA asked why a
    // viewer could read it; now `system:read` (admin and operator) is required.
    expect((await request(http).get('/v1/system/status')).status).toBe(401);
    expect((await request(http).get('/v1/system/status').set('Authorization', `Bearer ${token}`)).status).toBe(403);

    const res = await request(http).get('/v1/system/status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        version: expect.any(String),
        now: expect.any(String),
        db: expect.objectContaining({ connected: true, storageBytes: expect.any(Number) }),
        stream: expect.objectContaining({ mode: expect.any(String) }),
        disk: expect.objectContaining({ freeBytes: expect.any(Number), totalBytes: expect.any(Number) }),
        warnings: expect.any(Array),
      }),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|PASSWORD/);
  });

  it('warns when there has been no backup, when it failed, and when it is late', async () => {
    fs.rmSync(path.join(dataDir, 'logs', 'backup-last.json'), { force: true });
    expect((await service.status()).warnings.map((w) => w.code)).toContain('BACKUP_NONE');

    writeBackup({ at: new Date().toISOString(), ok: false, path: 'X', bytes: 0, error: 'mongodump failed (1)' });
    const failed = await service.status();
    expect(failed.warnings).toContainEqual({ code: 'BACKUP_FAILED', message: expect.stringContaining('mongodump failed') });

    writeBackup({ at: new Date(Date.now() - 50 * 3_600_000).toISOString(), ok: true, path: 'X', bytes: 1, error: '' });
    expect((await service.status()).warnings.map((w) => w.code)).toContain('BACKUP_STALE');

    writeBackup({ at: new Date().toISOString(), ok: true, path: 'X', bytes: 1, error: '' });
    const fresh = await service.status();
    expect(fresh.warnings.map((w) => w.code)).not.toEqual(expect.arrayContaining(['BACKUP_NONE', 'BACKUP_FAILED', 'BACKUP_STALE']));
    expect(fresh.backup).toMatchObject({ ok: true });
  });

  it('says when stored readings are newer than the PC clock — the clock went back', async () => {
    const now = await service.status();
    const latest = now.db.latestMinuteAt;
    expect(latest).not.toBeNull();
    const behind = await service.status(Date.parse(latest!) - 60 * 60_000);
    expect(behind.warnings.map((w) => w.code)).toContain('CLOCK_BEHIND');
    const fine = await service.status(Date.parse(latest!) + 60_000);
    expect(fine.warnings.map((w) => w.code)).not.toContain('CLOCK_BEHIND');
  });
});
