import 'dotenv/config';
import * as net from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose, { Types } from 'mongoose';

import { AppModule } from '../src/app.module';
import { StreamService } from '../src/stream/stream.service';
import { gillChecksum } from '../src/stream/gmx';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetDailySummary } from '../src/models/MetDailySummary';

/**
 * `STREAM_MODE=connect`: this PC dials the converter.
 *
 * The client said *"you should listen to that port"*, but the serial device
 * server he linked (a MOXA NPort) normally listens itself, and the software
 * connects to it. Until he confirms which, both work. Here the test plays a
 * converter that listens — then drops the link, then goes away entirely — and
 * the reader must keep coming back on its own.
 */
jest.setTimeout(60_000);

const BLE_ID = `STREAM-CONNECT-${process.pid}`;
const frame = (payload: string) => `\x02${payload}\x03${gillChecksum(payload)}\r\n`;
const LINE = frame('Q,090,004.00,090,004.00,+20.0,060,1012.0,00000.000,000.000,0000,');

async function waitFor(check: () => boolean, what: string, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('sensor stream, connect mode (e2e)', () => {
  let app: INestApplication;
  let stream: StreamService;
  let deviceId: Types.ObjectId;
  let converter: net.Server;
  let port: number;
  const accepted: net.Socket[] = [];
  const saved = { ...process.env };

  /** The converter: listens, and remembers who connected. */
  const startConverter = (onPort = 0): Promise<number> =>
    new Promise((resolve) => {
      converter = net.createServer((s) => accepted.push(s));
      converter.listen(onPort, '127.0.0.1', () => resolve((converter.address() as net.AddressInfo).port));
    });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    if (!admin) throw new Error('run `npm run seed` first');
    const device = await Device.create({ organizationId: admin.organizationId, bleId: BLE_ID, name: 'Connect-mode test station', type: 'MET-LINK' });
    deviceId = device._id as Types.ObjectId;

    port = await startConverter();
    Object.assign(process.env, {
      STREAM_ENABLED: 'true',
      STREAM_MODE: 'connect',
      STREAM_REMOTE_HOST: '127.0.0.1',
      STREAM_REMOTE_PORT: String(port),
      STREAM_REDIAL_MS: '100',
      STREAM_STATION_BLE_ID: BLE_ID,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    stream = app.get(StreamService);
    await app.init();
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
    await Device.deleteOne({ _id: deviceId });
    await mongoose.disconnect();
  });

  it('dials the converter and reads what it sends', async () => {
    await waitFor(() => accepted.length === 1, 'the reader to dial in');
    await waitFor(() => stream.getStatus().connected, 'the connection to register');
    accepted[0].write(LINE + LINE);
    await waitFor(() => stream.getStatus().counts.readings === 2, 'two readings');
    expect(stream.getStatus()).toMatchObject({ mode: 'connect', remote: `127.0.0.1:${port}`, listening: false });
  });

  it('redials when the converter drops the link', async () => {
    accepted[0].destroy();
    await waitFor(() => accepted.length === 2, 'the redial');
    await waitFor(() => stream.getStatus().connected, 'the new connection');
    accepted[1].write(LINE);
    await waitFor(() => stream.getStatus().counts.readings === 3, 'a reading on the new connection');
  });

  it('keeps trying while the converter is off, and says why', async () => {
    for (const s of accepted) s.destroy();
    await new Promise<void>((r) => converter.close(() => r()));
    await waitFor(() => (stream.getStatus().error ?? '').includes('cannot reach the converter'), 'the error to show');
    expect(stream.getStatus().connected).toBe(false);

    // Back on, on the same address: the reader finds it with no restart.
    await startConverter(port);
    await waitFor(() => accepted.length === 3, 'the reconnection', 40_000);
    await waitFor(() => stream.getStatus().error === null, 'the error to clear');
  });
});
