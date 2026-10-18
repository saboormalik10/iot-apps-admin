import 'dotenv/config';
import * as net from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { StreamService } from '../src/stream/stream.service';
import { isMasterAdmin } from '../src/system/master-admin';
import { AuditLog } from '../src/models/AuditLog';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';

/**
 * "Just shut the software. It should have a start and stop server" (client,
 * 10 Oct 2026) — the master administrator only. Stopping closes the sensor link
 * and stops recording; the portal stays up, so it can be started again there.
 */
describe('stopping and starting the weather station (e2e)', () => {
  const BLE_ID = `STATION-CONTROL-${process.pid}`;
  const second = `second-admin-${process.pid}@observator.test`;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let stream: StreamService;
  let deviceId: Types.ObjectId;
  let orgId: string;
  let adminToken: string;
  let viewerToken: string;
  const saved = { ...process.env };

  const boot = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    stream = app.get(StreamService);
    await app.init();
    http = app.getHttpServer();
  };
  const login = async (email: string, password: string) =>
    (await request(http).post('/v1/auth/login').send({ email, password })).body.data?.accessToken as string;
  const call = (method: 'get' | 'post', url: string, token: string) =>
    request(http)[method](url).set('Authorization', `Bearer ${token}`);
  const canConnect = (port: number) =>
    new Promise<boolean>((resolve) => {
      const s = net.connect(port, '127.0.0.1', () => {
        s.destroy();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.findOne({ slug: 'observator-au' }).lean();
    if (!org) throw new Error('run `npm run seed` first');
    orgId = String(org._id);
    const device = await Device.create({ organizationId: org._id, bleId: BLE_ID, name: 'Station-control test', type: 'MET-LINK' });
    deviceId = device._id as Types.ObjectId;
    Object.assign(process.env, { STREAM_ENABLED: 'true', STREAM_MODE: 'listen', STREAM_TCP_PORT: '0', STREAM_HOST: '127.0.0.1', STREAM_STATION_BLE_ID: BLE_ID });
    await boot();
    adminToken = await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');
    viewerToken = await login('viewer@observator.com', process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234');
  });

  afterAll(async () => {
    await app?.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    await User.deleteOne({ email: second });
    await AuditLog.deleteMany({ resourceId: String(deviceId) });
    await Device.deleteOne({ _id: deviceId });
    await mongoose.disconnect();
  });

  it('runs, and the master administrator may stop it', async () => {
    const res = await call('get', '/v1/system/station', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ allowed: true, running: true, stopped: null });
  });

  it('is closed to everyone else', async () => {
    expect((await call('post', '/v1/system/station/stop', viewerToken)).status).toBe(403);
    const other = await User.create({ organizationId: orgId, email: second, passwordHash: 'x', firstName: 'Second', role: 'admin' });
    expect(await isMasterAdmin(String(other._id), orgId)).toBe(false);
    expect(stream.getStatus().stopped).toBeNull();
  });

  it('stops: the sensor link closes, nothing is recorded, and it says who stopped it', async () => {
    const port = stream.getStatus().port!;
    expect(await canConnect(port)).toBe(true);
    const res = await call('post', '/v1/system/station/stop', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ running: false, stopped: { by: 'admin@observator.com' } });
    expect(stream.getStatus()).toMatchObject({ listening: false, connected: false });
    expect(await canConnect(port)).toBe(false);

    const sys = await call('get', '/v1/system/status', adminToken);
    expect(sys.body.data.warnings.map((w: { code: string }) => w.code)).toContain('STATION_STOPPED');
    expect((await Device.findById(deviceId).lean())?.stationStopped).toMatchObject({ by: 'admin@observator.com' });
  });

  it('stays stopped when the PC or the service restarts', async () => {
    await app.close();
    await boot();
    expect(stream.getStatus()).toMatchObject({ listening: false, stopped: { by: 'admin@observator.com' } });
  });

  it('starts again from the portal', async () => {
    const res = await call('post', '/v1/system/station/start', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ allowed: true, running: true, stopped: null });
    expect(stream.getStatus().listening).toBe(true);
    expect(await canConnect(stream.getStatus().port!)).toBe(true);
    expect((await Device.findById(deviceId).lean())?.stationStopped).toBeNull();

    const rows = await AuditLog.find({ resourceId: String(deviceId) }).lean();
    expect(rows.map((r) => r.resourceName)).toEqual(expect.arrayContaining(['Weather station stopped', 'Weather station started']));
  });
});
