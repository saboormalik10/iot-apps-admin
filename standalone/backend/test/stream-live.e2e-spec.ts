import 'dotenv/config';
import * as net from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose, { Types } from 'mongoose';
import { io, Socket } from 'socket.io-client';

import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/stream.service';
import { gillChecksum } from '../src/stream/gmx';
import { ClientEvent } from '../src/realtime/realtime.events';
import { signWsTicket } from '../src/utils/jwt';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * The real-time wind dial, measured the way the plan says: by COUNTING socket
 * events. The client wants every display updated once a minute *"except for the
 * wind dial that should have real time update"* (21 Sep 2026) — so a browser
 * watching the station must get one `met:live` per reading and one `met:latest`
 * per minute.
 *
 * A real socket.io client, a real TCP sensor, its own throwaway station.
 */
jest.setTimeout(60_000);

const BLE_ID = `STREAM-LIVE-${process.pid}`;
const frame = (payload: string) => `\x02${payload}\x03${gillChecksum(payload)}\r\n`;
const line = (dir: number, speed: number, status = '0000') =>
  frame(`Q,${dir},${speed.toFixed(2)},${dir},${speed.toFixed(2)},+20.0,060,1012.0,00000.000,000.000,${status},`);

async function waitFor(check: () => boolean, what: string, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('real-time wind dial (e2e)', () => {
  let app: INestApplication;
  let stream: StreamService;
  let url: string;
  let deviceId: Types.ObjectId;
  let ticket: string;
  let clock = 0;
  const T0 = Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000;
  const saved = { ...process.env };

  const live: Array<{ measuredAtMs: number; windSpeedMs: number | null; windDirTrueDeg: number | null }> = [];
  let latestCount = 0;
  let watcher: Socket;
  let bystander: Socket;
  let bystanderGotLive = 0;
  let sensor: net.Socket;

  const connectSocket = async (): Promise<Socket> => {
    const s = io(url, { path: '/v1/ws', auth: { token: ticket }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      s.on('connect', () => resolve());
      s.on('connect_error', reject);
    });
    return s;
  };

  const sendAt = async (atMs: number, data: string) => {
    const before = stream.getStatus().counts.lines;
    clock = atMs;
    sensor.write(data);
    await waitFor(() => stream.getStatus().counts.lines > before, 'the line to be read');
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    if (!admin) throw new Error('run `npm run seed` first');
    const device = await Device.create({
      organizationId: admin.organizationId,
      bleId: BLE_ID,
      name: 'Live dial test station',
      type: 'MET-LINK',
      // A surveyed mast offset: the dial must show TRUE bearing.
      headingOffsetDeg: 10,
    });
    deviceId = device._id as Types.ObjectId;

    Object.assign(process.env, {
      STREAM_ENABLED: 'true',
      STREAM_TCP_PORT: '0',
      STREAM_HOST: '127.0.0.1',
      STREAM_STATION_BLE_ID: BLE_ID,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    stream = app.get(StreamService);
    (stream as unknown as { now: () => number }).now = () => clock;
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    ticket = signWsTicket({
      userId: String(admin._id),
      organizationId: String(admin.organizationId),
      role: admin.role ?? 'admin',
      email: admin.email,
    } as never);

    watcher = await connectSocket();
    watcher.on(ClientEvent.MET_LIVE, (p) => live.push(p));
    watcher.on(ClientEvent.MET_LATEST, () => (latestCount += 1));
    const ack = await watcher.timeout(10_000).emitWithAck('subscribe:device', { deviceId: String(deviceId) });
    expect(ack.subscribed).toBe(String(deviceId));

    // Signed in, but not looking at this station.
    bystander = await connectSocket();
    bystander.on(ClientEvent.MET_LIVE, () => (bystanderGotLive += 1));

    sensor = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: '127.0.0.1', port: stream.port! }, () => resolve(s));
      s.on('error', reject);
    });
    await waitFor(() => stream.getStatus().connected, 'the sensor connection');
  });

  afterAll(async () => {
    watcher?.disconnect();
    bystander?.disconnect();
    sensor?.destroy();
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

  it('sends every reading to the dial, and each minute once to everything else', async () => {
    // Two whole minutes, and the first reading of a third to complete the second.
    for (let s = 0; s <= 120; s++) await sendAt(T0 + s * 1000 + 100, line(350, 3 + (s % 5)));
    await (stream as unknown as { writes: Promise<void> }).writes;

    await waitFor(() => live.length >= 121, '121 met:live events');
    await waitFor(() => latestCount >= 2, '2 met:latest events');
    await new Promise((r) => setTimeout(r, 200)); // anything extra would arrive now

    expect(live).toHaveLength(121); // one per reading: the dial moves every second
    expect(latestCount).toBe(2); // one per minute written: every other tile
  });

  it('points the dial at TRUE north — the mast offset applied', () => {
    // 350° relative + a 10° surveyed offset = 0°, due north.
    expect(live[0].windDirTrueDeg).toBe(0);
    expect(live[0].windSpeedMs).toBe(3);
    expect(live[0].measuredAtMs).toBe(T0 + 100);
  });

  it('sends a faulty reading as "no reading", never as a needle swing', async () => {
    const before = live.length;
    await sendAt(T0 + 121_100, line(90, 40, '0100'));
    await waitFor(() => live.length > before, 'the faulty reading');
    expect(live[live.length - 1]).toMatchObject({ windSpeedMs: null, windDirTrueDeg: null });
  });

  it('sends nothing to a browser that is not watching this station', () => {
    expect(bystanderGotLive).toBe(0);
  });

  it('stores only the minute — never the per-second readings', async () => {
    const record = await MetRecord.findOne({ deviceId }).lean();
    expect(await MetMeasure.countDocuments({ recordId: record!._id })).toBe(2);
  });
});
