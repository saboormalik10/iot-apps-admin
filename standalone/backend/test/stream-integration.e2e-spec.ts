import 'dotenv/config';
import * as net from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/stream.service';
import { gillChecksum } from '../src/stream/gmx';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * The sensor stream end to end: a TCP client plays the converter, the whole app
 * listens, and a minute of readings becomes ONE minute record in the database.
 *
 * The readings' clock is the service's — it is moved here so a full minute can
 * be sent in a second. Everything else is real: the socket, the framing, the
 * parser, QC, the minute aggregate and the writes.
 *
 * Writes to its OWN station, created and removed here, so the seeded data the
 * other suites read is never touched.
 */
jest.setTimeout(60_000);

const BLE_ID = `STREAM-TEST-${process.pid}`;
const frame = (payload: string) => `\x02${payload}\x03${gillChecksum(payload)}\r\n`;
/** NODE, DIR, SPEED, CDIR, CSPEED, TEMP, RH, PRESS, PRECIPT, PRECIPI, STATUS */
const line = (dir: number, speed: number, rainTotal: number, temp = 21.5) =>
  frame(
    `Q,${dir},${speed.toFixed(2)},${dir},${speed.toFixed(2)},+${temp.toFixed(1)},060,1012.0,${rainTotal.toFixed(3)},000.000,0000,`,
  );

async function waitFor(check: () => boolean, what: string, ms = 3_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('sensor stream (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let stream: StreamService;
  let deviceId: Types.ObjectId;
  let clock = 0;
  // Five minutes ago, on a minute boundary: recent enough to count as live, and
  // clear of the real minute the test runs in.
  const T0 = Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000;

  const saved = { ...process.env };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.findOne({ slug: 'observator-au' }).lean();
    if (!org) throw new Error('run `npm run seed` first');
    const device = await Device.create({
      organizationId: org._id,
      bleId: BLE_ID,
      name: 'Stream test station',
      type: 'MET-LINK',
    });
    deviceId = device._id as Types.ObjectId;

    process.env.STREAM_ENABLED = 'true';
    process.env.STREAM_TCP_PORT = '0';
    process.env.STREAM_HOST = '127.0.0.1';
    process.env.STREAM_STATION_BLE_ID = BLE_ID;
    process.env.STREAM_CHECKSUM = 'auto';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    stream = app.get(StreamService);
    (stream as unknown as { now: () => number }).now = () => clock;
    await app.init();
    http = app.getHttpServer();

    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    token = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetDailySummary.deleteMany({ deviceId });
    await Device.deleteOne({ _id: deviceId });
    await mongoose.disconnect();
  });

  /** Connect as the converter would. */
  const connect = (): Promise<net.Socket> =>
    new Promise((resolve, reject) => {
      const s = net.connect({ host: '127.0.0.1', port: stream.port! }, () => resolve(s));
      s.on('error', reject);
    });

  /** Send one chunk "at" a moment, and wait until the service has read it. */
  const sendAt = async (socket: net.Socket, atMs: number, data: string, lines = 1) => {
    const before = stream.getStatus().counts.lines;
    clock = atMs;
    socket.write(data);
    await waitFor(() => stream.getStatus().counts.lines >= before + lines, 'the line to be read');
  };

  let sensor: net.Socket;

  it('listens on the configured port', () => {
    const s = stream.getStatus();
    expect(s.listening).toBe(true);
    expect(s.port).toBeGreaterThan(0);
  });

  it('turns a minute of 1 Hz readings into ONE minute record', async () => {
    sensor = await connect();
    await waitFor(() => stream.getStatus().connected, 'the connection');

    // The unit's power-up header, as its own line.
    await sendAt(sensor, T0, 'NODE,DIR,SPEED,CDIR,CSPEED,TEMP,RH,PRESS,PRECIPT,PRECIPI,STATUS,CHECK\r\n');

    for (let s = 0; s < 60; s++) {
      // Wind straddling north — 350° and 10° alternate. Their arithmetic mean is
      // 180° (due SOUTH); the vector mean is north. A 3-second burst to 12 m/s
      // is the gust. Rain: the gauge's counter rises 0.2 mm at second 30.
      const dir = s % 2 ? 10 : 350;
      const speed = s >= 20 && s < 23 ? 12 : 4;
      await sendAt(sensor, T0 + s * 1000 + 100, line(dir, speed, s < 30 ? 812.0 : 812.2));
    }
    // The first reading of the next minute completes the first.
    await sendAt(sensor, T0 + 60_000 + 100, line(350, 4, 812.2));
    await (stream as unknown as { writes: Promise<void> }).writes;

    const record = await MetRecord.findOne({ deviceId }).lean();
    expect(record).not.toBeNull();
    expect(record!.source).toBe('stream');

    const rows = await MetMeasure.find({ recordId: record!._id, res: '1m' }).lean();
    expect(rows).toHaveLength(1);
    const m = rows[0];
    expect(m.timestampMs).toBe(T0);
    expect(m.source).toBe('stream');
    expect(m.windSampleCount).toBe(60);
    // North, not south.
    const bearing = m.windDirTrueDeg!;
    expect(Math.min(bearing, 360 - bearing)).toBeLessThan(1);
    expect(m.windGustMs).toBeCloseTo(12, 1);
    expect(m.windSpeedMs).toBeCloseTo(4.4, 1);
    expect(m.tempC).toBe(21.5);
    expect(m.humidityPct).toBe(60);
    // The site total: the counter's 812.0 was a baseline, the 0.2 rise is rain.
    expect(m.precipMm).toBeCloseTo(0.2, 3);
    expect(m.dewPointC).not.toBeNull();
  });

  it('marks the station online and saves the rain state for a restart', async () => {
    const d = await Device.findById(deviceId).lean();
    expect(d!.lastSeenAt).not.toBeNull();
    // With when the gauge was last read, so an outage may legitimately bring a big rise.
    expect(d!.rainState).toEqual({ totalMm: 0.2, lastRawMm: 812.2, lastAtMs: expect.any(Number) });
    expect(d!.availableSensors).toEqual(expect.arrayContaining(['wind_speed', 'temperature', 'precipitation']));
     // The GMX551 sent a compass-corrected bearing (CDIR), so directions are from
    // magnetic north — what the dial says while no heading offset is set.
    expect(d!.windDirReference).toBe('magnetic');
  });

  it('counts a bad checksum and stores nothing from it', async () => {
    const bad = line(90, 30, 812.2).replace(/..\r\n$/, '00\r\n');
    await sendAt(sensor, T0 + 61_000, bad);
    expect(stream.getStatus().counts.checksumErrors).toBe(1);
  });

  it('reassembles a reading split across packets', async () => {
    const whole = line(90, 5, 812.2);
    const before = stream.getStatus().counts.readings;
    clock = T0 + 62_000;
    sensor.write(whole.slice(0, 10));
    await new Promise((r) => setTimeout(r, 20));
    await sendAt(sensor, T0 + 62_000, whole.slice(10));
    expect(stream.getStatus().counts.readings).toBe(before + 1);
  });

  it('lets a reconnecting converter replace a dead connection', async () => {
    const second = await connect();
    await waitFor(() => stream.getStatus().counts.connections === 2, 'the second connection');
    await sendAt(second, T0 + 63_000, line(90, 5, 812.2));
    expect(stream.getStatus().connected).toBe(true);
    sensor = second;
  });

  it('writes the part-minute on shutdown rather than losing it', async () => {
    await stream.flushNow();
    const record = await MetRecord.findOne({ deviceId }).lean();
    const minute1 = await MetMeasure.findOne({ recordId: record!._id, res: '1m', timestampMs: T0 + 60_000 }).lean();
    expect(minute1).not.toBeNull();
    // Three readings reached minute 1 (the bad checksum did not).
    expect(minute1!.windSampleCount).toBe(3);
  });

  it('reports its status to a signed-in user', async () => {
    const res = await request(http).get('/v1/stream/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ listening: true, connected: true, stationId: String(deviceId) });
    // 60 in minute 0, then three in minute 1; the bad checksum is not a reading.
    expect(res.body.data.counts.readings).toBe(63);
    expect(res.body.data.minutesWritten).toBe(2);
  });

  it('refuses the status to an anonymous caller', async () => {
    const res = await request(http).get('/v1/stream/status');
    expect(res.status).toBe(401);
  });
});
