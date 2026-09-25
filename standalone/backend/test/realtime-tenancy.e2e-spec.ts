import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import { io, Socket } from 'socket.io-client';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { EventsGateway } from '../src/realtime/events.gateway';
import { ClientEvent } from '../src/realtime/realtime.events';
import { signWsTicket } from '../src/utils/jwt';

/**
 * `subscribe:device` used to join ANY device room by id, with no ownership
 * check at all — `handleConnection` stored the caller's JWT on the socket and
 * the subscribe handler simply never read it.
 *
 * A device id is not a secret: it appears in portal URLs and in exported files.
 * So any authenticated customer who had one could receive another customer's
 * live readings.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS THE DELIVERY AND NOT THE ACK
 * The handler's return value is cosmetic. The leak is the ROOM MEMBERSHIP, so
 * the load-bearing assertion is that a `met:latest` broadcast for the foreign
 * device never arrives. A test that only checked the ack would still pass if the
 * join were left in place.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('realtime device subscription is tenant-scoped (e2e)', () => {
  let app: INestApplication;
  let gateway: EventsGateway;
  let url: string;

  let orgA: mongoose.Types.ObjectId;
  let orgB: mongoose.Types.ObjectId;
  let deviceA: string;
  let deviceB: string;
  let tokenA: string;

  /** Connect as the org-A user and wait until the gateway has accepted us. */
  const connectAsA = async (): Promise<Socket> => {
    const socket = io(url, { path: '/v1/ws', auth: { token: tokenA }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
      socket.on('unauthorized', (e: unknown) => reject(new Error(`unauthorized: ${JSON.stringify(e)}`)));
    });
    return socket;
  };

  const subscribe = (socket: Socket, deviceId: string): Promise<{ subscribed: string | null; error?: string }> =>
    socket.timeout(10_000).emitWithAck('subscribe:device', { deviceId });

  /**
   * Broadcast a met:latest for `deviceId` and report whether `socket` got it.
   *
   * Resolves false on the timeout rather than rejecting: "nothing arrived" is
   * the PASSING outcome for the foreign device, so it must be an ordinary value.
   */
  const receivesBroadcastFor = (socket: Socket, deviceId: string): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 2_000);
      socket.once(ClientEvent.MET_LATEST, () => {
        clearTimeout(timer);
        resolve(true);
      });
      gateway.onMetMeasures({
        deviceId,
        recordId: new mongoose.Types.ObjectId().toString(),
        organizationId: String(orgA),
        latest: { timestampMs: Date.now(), windSpeedMs: 4.2 },
        isBackfill: false,
      } as never);
    });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // A real listening server: the gateway only exists once the adapter binds.
    await app.listen(0);
    gateway = app.get(EventsGateway);
    url = await app.getUrl().then((u) => u.replace('[::1]', '127.0.0.1'));

    // Org A is the platform's own org; org B is a throwaway "other customer".
    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgA = admin!.organizationId as mongoose.Types.ObjectId;

    const other = await Organization.create({
      name: `WS-TENANCY throwaway ${STAMP}`,
      slug: `ws-tenancy-${STAMP}`,
      contactEmail: `ws-tenancy-${STAMP}@example.invalid`,
      country: 'AU',
      timezone: 'Australia/Sydney',
    });
    orgB = other._id as mongoose.Types.ObjectId;

    // Throwaway devices only — never a real station, so a stray broadcast in
    // this test can never touch a customer's live dashboard or alert rules.
    const [a, b] = await Promise.all([
      Device.create({
        organizationId: orgA,
        name: 'WS-TENANCY own station',
        type: 'MET-LINK',
        bleId: `WS-TENANCY-A-${STAMP}`,
        isActive: true,
      }),
      Device.create({
        organizationId: orgB,
        name: 'WS-TENANCY foreign station',
        type: 'MET-LINK',
        bleId: `WS-TENANCY-B-${STAMP}`,
        isActive: true,
      }),
    ]);
    deviceA = String(a._id);
    deviceB = String(b._id);

    tokenA = signWsTicket({
      userId: String(admin!._id),
      organizationId: String(orgA),
      role: admin!.role ?? 'admin',
      email: admin!.email,
    } as never);
  });

  afterAll(async () => {
    await Device.deleteMany({ bleId: { $in: [`WS-TENANCY-A-${STAMP}`, `WS-TENANCY-B-${STAMP}`] } });
    await Organization.deleteOne({ _id: orgB });
    await app?.close();
    await mongoose.disconnect();
  });

  it('lets a client subscribe to a device its OWN organisation owns', async () => {
    const socket = await connectAsA();
    try {
      await expect(subscribe(socket, deviceA)).resolves.toEqual({ subscribed: deviceA });
      await expect(receivesBroadcastFor(socket, deviceA)).resolves.toBe(true);
    } finally {
      socket.close();
    }
  });

  it('refuses a device belonging to ANOTHER organisation', async () => {
    const socket = await connectAsA();
    try {
      const ack = await subscribe(socket, deviceB);
      expect(ack.subscribed).toBeNull();
      expect(ack.error).toBe('FORBIDDEN');

      // The real assertion: refusing the ack is worthless if the join happened.
      await expect(receivesBroadcastFor(socket, deviceB)).resolves.toBe(false);
    } finally {
      socket.close();
    }
  });

  it('refuses a device id that does not exist, without throwing', async () => {
    const socket = await connectAsA();
    try {
      const missing = new mongoose.Types.ObjectId().toString();
      await expect(subscribe(socket, missing)).resolves.toEqual({ subscribed: null, error: 'FORBIDDEN' });
      // A malformed id would make Device.findById throw a CastError; an
      // unhandled rejection there would take the gateway down, not refuse.
      await expect(subscribe(socket, 'not-an-object-id')).resolves.toEqual({
        subscribed: null,
        error: 'FORBIDDEN',
      });
    } finally {
      socket.close();
    }
  });
});
