import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { io as ioClient, Socket } from 'socket.io-client';
import type { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { verifyAccessToken } from '../src/utils/jwt';

/**
 * Month 7 (Part A1) — `POST /v1/auth/ws-ticket`.
 *
 * Under the BFF model the browser never holds the 15m access token, so realtime
 * needs a short-lived ticket for the socket.io handshake. This endpoint mints one
 * signed on the same ACCESS_SECRET, so the gateway verifies it unchanged.
 */
describe('Auth ws-ticket (e2e)', () => {
  let app: INestApplication;
  let httpServer: unknown;
  let accessToken: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer();

    const login = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' });
    accessToken = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('POST /v1/auth/ws-ticket without a bearer token → 401', async () => {
    const res = await request(httpServer).post('/v1/auth/ws-ticket');
    expect(res.status).toBe(401);
  });

  it('POST /v1/auth/ws-ticket with a valid access token → 201 { data: { ticket, expiresInSec } }', async () => {
    const res = await request(httpServer)
      .post('/v1/auth/ws-ticket')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(201);
    expect(typeof res.body.data?.ticket).toBe('string');
    expect(res.body.data?.expiresInSec).toBe(60);
  });

  it('the minted ticket verifies with the access-token secret and claims match, exp ≈ now + 60s', async () => {
    const res = await request(httpServer)
      .post('/v1/auth/ws-ticket')
      .set('Authorization', `Bearer ${accessToken}`);

    const original = verifyAccessToken(accessToken);
    const decoded = verifyAccessToken(res.body.data.ticket);

    expect(decoded.userId).toBe(original.userId);
    expect(decoded.organizationId).toBe(original.organizationId);
    expect(decoded.role).toBe(original.role);

    const now = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThan(now);
    // ~60s TTL, allowing a few seconds of clock/latency slack.
    expect(decoded.exp! - now).toBeLessThanOrEqual(65);
    expect(decoded.exp! - now).toBeGreaterThan(45);
  });

  it('(smoke) a socket.io client connects to /v1/ws using the ticket as auth.token', async () => {
    const ticketRes = await request(httpServer)
      .post('/v1/auth/ws-ticket')
      .set('Authorization', `Bearer ${accessToken}`);
    const ticket = ticketRes.body.data.ticket as string;

    // Bind the Nest app to an ephemeral port so the socket.io gateway is reachable.
    await app.listen(0);
    const address = (app.getHttpServer() as { address(): AddressInfo }).address();
    const url = `http://127.0.0.1:${address.port}`;

    const socket: Socket = ioClient(url, {
      path: '/v1/ws',
      transports: ['websocket'],
      auth: { token: ticket },
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timed out')), 10000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('unauthorized', (p: unknown) => {
        clearTimeout(timer);
        reject(new Error(`unauthorized: ${JSON.stringify(p)}`));
      });
      socket.on('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
