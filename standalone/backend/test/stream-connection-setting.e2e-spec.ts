import 'dotenv/config';
import * as net from 'net';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { StreamService } from '../src/stream/stream.service';
import { gillChecksum } from '../src/stream/gmx';
import { AuditLog } from '../src/models/AuditLog';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * The sensor connection, changed in the portal (client, 9 Oct 2026: his converter
 * is a TCP server, and "there is nothing in the software for me to setup the
 * connection to the sensor/converter").
 *
 * The site PC was installed listening; the converter only listens too. Switching
 * to "this PC connects to the converter" in the portal must reach it at once — no
 * restart, no settings file — and must still be in force after a restart.
 */
jest.setTimeout(60_000);

const BLE_ID = `STREAM-SETTING-${process.pid}`;
const frame = (payload: string) => `\x02${payload}\x03${gillChecksum(payload)}\r\n`;
const LINE = frame('Q,090,004.00,090,004.00,+20.0,060,1012.0,00000.000,000.000,0000,');

async function waitFor(check: () => boolean, what: string, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('sensor connection set in the portal (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let stream: StreamService;
  let deviceId: Types.ObjectId;
  let adminToken: string;
  let viewerToken: string;
  let converter: net.Server;
  let converterPort: number;
  const accepted: net.Socket[] = [];
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
  const login = async (email: string, password: string) => {
    const res = await request(http).post('/v1/auth/login').send({ email, password });
    return (res.body.data?.accessToken ?? res.body.accessToken) as string;
  };
  const put = (token: string, body: unknown) =>
    request(http).put('/v1/stream/connection').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.findOne({ slug: 'observator-au' }).lean();
    if (!org) throw new Error('run `npm run seed` first');
    const device = await Device.create({ organizationId: org._id, bleId: BLE_ID, name: 'Connection-setting test station', type: 'MET-LINK' });
    deviceId = device._id as Types.ObjectId;

    // The converter: a TCP server, like the client's.
    converter = net.createServer((s) => accepted.push(s));
    converterPort = await new Promise((resolve) =>
      converter.listen(0, '127.0.0.1', () => resolve((converter.address() as net.AddressInfo).port)),
    );

    // Installed the usual way: listening.
    Object.assign(process.env, {
      STREAM_ENABLED: 'true',
      STREAM_MODE: 'listen',
      STREAM_TCP_PORT: '0',
      STREAM_HOST: '127.0.0.1',
      STREAM_REDIAL_MS: '100',
      STREAM_STATION_BLE_ID: BLE_ID,
    });
    await boot();
    adminToken = await login('admin@observator.com', process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234');
    viewerToken = await login('viewer@observator.com', process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234');
  });

  afterAll(async () => {
    await app?.close();
    for (const s of accepted) s.destroy();
    await new Promise<void>((r) => converter.close(() => r()));
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetDailySummary.deleteMany({ deviceId });
    await AuditLog.deleteMany({ resourceId: String(deviceId) });
    await Device.deleteOne({ _id: deviceId });
    await mongoose.disconnect();
  });

  it('starts from the settings file', () => {
    expect(stream.getStatus()).toMatchObject({ mode: 'listen', listening: true, connection: { mode: 'listen', source: 'file' } });
  });

  it('is for administrators only', async () => {
    const res = await put(viewerToken, { mode: 'connect', remoteHost: '127.0.0.1', remotePort: converterPort });
    expect(res.status).toBe(403);
    expect(stream.getStatus().mode).toBe('listen');
  });

  it.each([
    [{ mode: 'connect' }, "converter's address"],
    [{ mode: 'connect', remoteHost: 'not a host!' }, 'not an IP address'],
    [{ mode: 'connect', remoteHost: '127.0.0.1', remotePort: 70_000 }, ''],
    [{ mode: 'sideways' }, ''],
  ])('refuses %j', async (body, message) => {
    const res = await put(adminToken, body);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(message);
    expect(stream.getStatus().mode).toBe('listen');
  });

  it('switches to dialling the converter at once, and reads from it', async () => {
    const res = await put(adminToken, { mode: 'connect', remoteHost: '127.0.0.1', remotePort: converterPort });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      mode: 'connect',
      remote: `127.0.0.1:${converterPort}`,
      listening: false,
      connection: { mode: 'connect', remoteHost: '127.0.0.1', remotePort: converterPort, source: 'portal', changedBy: 'admin@observator.com' },
    });
    await waitFor(() => accepted.length === 1, 'the PC to dial the converter');
    await waitFor(() => stream.getStatus().connected, 'the connection');
    const before = stream.getStatus().counts.readings;
    accepted[0].write(LINE);
    await waitFor(() => stream.getStatus().counts.readings === before + 1, 'a reading from the converter');
  });

  it('shows what arrived when it is not a reading', async () => {
    // Five columns, no header: not the layout the reader expects.
    accepted[0].write(frame('Q,090,004.00,+20.0,0000,') + '\r\n');
    await waitFor(() => stream.getStatus().counts.columnMismatches === 1, 'the line to be refused');
    const st = stream.getStatus();
    expect(st.counts.bytes).toBeGreaterThan(0);
    expect(st.lastLine).toMatch(/^<STX>Q,090,004\.00,\+20\.0,0000,<ETX>[0-9A-F]{2}$/);
    expect(st.lastRejected).toMatchObject({ reason: 'COLUMN_COUNT' });
    const sys = await request(http).get('/v1/system/status').set('Authorization', `Bearer ${adminToken}`);
    expect(sys.body.data.stream).toMatchObject({ columnMismatches: 1, lastLine: st.lastLine });
  });

  it('saves it on the station and records who changed it', async () => {
    const device = await Device.findById(deviceId).lean();
    expect(device?.sensorConnection).toMatchObject({ mode: 'connect', remoteHost: '127.0.0.1', remotePort: converterPort, changedBy: 'admin@observator.com' });
    // Written without waiting for it, like every audit row: give it a moment.
    let row = null;
    for (let i = 0; i < 50 && !row; i++) {
      row = await AuditLog.findOne({ resourceId: String(deviceId), resourceName: 'Sensor connection' }).lean();
      if (!row) await new Promise((r) => setTimeout(r, 50));
    }
    expect(row).toMatchObject({ action: 'update', resourceType: 'device', userEmail: 'admin@observator.com', changes: { before: { mode: 'listen' }, after: { mode: 'connect' } } });
  });

  it('switches back to listening, closing the old link', async () => {
    const closed = new Promise<void>((r) => accepted[0].once('close', () => r()));
    const res = await put(adminToken, { mode: 'listen' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mode: 'listen', listening: true, remote: null, connection: { mode: 'listen', remoteHost: '127.0.0.1' } });
    await closed;
    const port = stream.getStatus().port!;
    const sensor = net.connect(port, '127.0.0.1');
    await waitFor(() => stream.getStatus().connected, 'the converter to connect in');
    const before = stream.getStatus().counts.readings;
    sensor.write(LINE);
    await waitFor(() => stream.getStatus().counts.readings === before + 1, 'a reading on the listening port');
    sensor.destroy();
  });

  it('keeps the portal setting over the settings file after a restart', async () => {
    expect((await put(adminToken, { mode: 'connect', remoteHost: '127.0.0.1', remotePort: converterPort })).status).toBe(200);
    await waitFor(() => accepted.length === 2, 'the second dial');
    await app.close();

    // The settings file still says listen.
    await boot();
    await waitFor(() => accepted.length === 3, 'the restarted service to dial the converter');
    expect(stream.getStatus()).toMatchObject({ mode: 'connect', listening: false, connection: { source: 'portal', remotePort: converterPort } });
  });

  it("lets the installer's choice, made after it, replace the portal's", async () => {
    // The installer run again with a different connection sets this for setup-site.
    const runSetup = (reset: boolean) =>
      promisify(execFile)(
        path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node'),
        [path.join(__dirname, '..', 'src', 'scripts', 'setup-site.ts')],
        { cwd: path.join(__dirname, '..'), env: { ...process.env, STANDALONE_RESET_SENSOR_CONNECTION: reset ? '1' : '' } },
      );
    await runSetup(false);
    expect((await Device.findById(deviceId).lean())?.sensorConnection).toMatchObject({ mode: 'connect' });
    const { stdout } = await runSetup(true);
    expect(stdout).toContain("the installer's choice replaces the one set in the portal");
    expect((await Device.findById(deviceId).lean())?.sensorConnection).toBeNull();
  });
});
