import 'dotenv/config';
import { INestApplication, ValidationPipe, BadRequestException, ValidationError } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Guards the mobile-facing write path:
 *   • POST /v1/sessions validates deviceId format + org ownership
 *   • the device-reported probeRange beats the turbidity-threshold guess
 *   • a re-sync converges comment / endTimestamp
 *   • ValidationPipe errors keep the { error: { code, message } } envelope
 *   • MET sync still round-trips through the now-validated SyncUploadDto
 *
 * Uses the data created by `npm run seed`. Run the seed first.
 */
describe('Session validation & probe range (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let nepDeviceId: string;
  let metDeviceId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });

    // Mirror main.ts exactly — the exceptionFactory IS part of what we assert.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        exceptionFactory: (errors: ValidationError[]) => {
          const flatten = (errs: ValidationError[], prefix = ''): string[] =>
            errs.flatMap((e) => {
              const path = prefix ? `${prefix}.${e.property}` : e.property;
              const own = Object.values(e.constraints ?? {}).map((m) =>
                m.replace(new RegExp(`^${e.property}\\b`), path),
              );
              const children = e.children?.length ? flatten(e.children, path) : [];
              return [...own, ...children];
            });
          const message = flatten(errors).join('; ') || 'Validation failed';
          return new BadRequestException({ error: { code: 'VALIDATION_ERROR', message } });
        },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    const login = await request(http)
      .post('/v1/auth/login')
      .send({ email: 'admin@observator.com', password: 'Admin@1234' });
    token = login.body.accessToken ?? login.body.data?.accessToken;

    const devices = await request(http).get('/v1/dashboard/devices').set('Authorization', `Bearer ${token}`);
    for (const d of devices.body) {
      if (d.type === 'NEP-LINK') nepDeviceId = d._id;
      if (d.type === 'MET-LINK') metDeviceId = d._id;
    }
  });

  afterAll(async () => {
    for (const id of createdSessionIds) {
      await request(http).delete(`/v1/sessions/${id}`).set(auth());
    }
    await app?.close();
    await mongoose.disconnect();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const sessionBody = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    deviceId: nepDeviceId,
    deviceName: 'NEP-LINK-TEST',
    startTimestamp: Date.now(),
    timezoneName: 'Australia/Brisbane',
    timezoneOffset: 10,
    ...over,
  });

  // ── deviceId validation ───────────────────────────────────────────────────

  it('rejects a Bluetooth MAC as deviceId with 400 (not a 500)', async () => {
    const res = await request(http)
      .post('/v1/sessions')
      .set(auth())
      .send(sessionBody({ deviceId: 'A4:C1:38:5F:2B:9E' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('deviceId');
  });

  it('rejects a well-formed but unknown deviceId with 404', async () => {
    const res = await request(http)
      .post('/v1/sessions')
      .set(auth())
      .send(sessionBody({ deviceId: '664a1f2e3c4d5e6f7a8b9c0f' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a non-UUID session id with 400', async () => {
    const res = await request(http).post('/v1/sessions').set(auth()).send(sessionBody({ id: 'not-a-uuid' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('id');
  });

  it('rejects a string timezoneOffset like "+05:00" with 400', async () => {
    const res = await request(http).post('/v1/sessions').set(auth()).send(sessionBody({ timezoneOffset: '+05:00' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('timezoneOffset');
  });

  // ── probe range precedence ────────────────────────────────────────────────

  it('uses the probeRange reported by the device over the turbidity guess', async () => {
    const body = sessionBody({
      // turbidity 5000 would derive R3; the instrument says R1 — the instrument wins.
      samples: [{ timestamp: Date.now(), turbidityValue: 5000, probeRange: 'R1' }],
    });
    const res = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(res.status).toBe(201);
    createdSessionIds.push(body.id as string);
    expect(res.body.data.probeRange).toBe('R1');
  });

  it('falls back to the derived range when no sample reports one', async () => {
    const body = sessionBody({
      samples: [{ timestamp: Date.now(), turbidityValue: 5000 }],
    });
    const res = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(res.status).toBe(201);
    createdSessionIds.push(body.id as string);
    expect(res.body.data.probeRange).toBe('R3');
  });

  it('keeps the reported range after a samples top-up recompute', async () => {
    const body = sessionBody({
      samples: [{ timestamp: Date.now(), turbidityValue: 5000, probeRange: 'R1' }],
    });
    const created = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(created.status).toBe(201);
    const id = body.id as string;
    createdSessionIds.push(id);

    const more = await request(http)
      .post(`/v1/sessions/${id}/samples`)
      .set(auth())
      .send({ samples: [{ timestamp: Date.now() + 1000, turbidityValue: 4800, probeRange: 'R1' }] });
    expect(more.status).toBe(201);

    const after = await request(http).get(`/v1/sessions/${id}`).set(auth());
    expect(after.body.data.probeRange).toBe('R1');
  });

  it('rejects an invalid probeRange value', async () => {
    const res = await request(http)
      .post('/v1/sessions')
      .set(auth())
      .send(sessionBody({ samples: [{ timestamp: Date.now(), turbidityValue: 12, probeRange: 'R9' }] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ── metadata convergence on re-sync ───────────────────────────────────────

  it('applies an edited comment and a late endTimestamp on re-sync', async () => {
    const body = sessionBody({ comment: '' });
    const id = body.id as string;

    const first = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(first.status).toBe(201);
    createdSessionIds.push(id);
    expect(first.body.data.endTimestamp).toBeNull();

    const endTimestamp = Date.now() + 60_000;
    const second = await request(http)
      .post('/v1/sessions')
      .set(auth())
      .send({ ...body, comment: 'Re-sampled after rain', endTimestamp });
    expect(second.status).toBe(201);
    expect(second.body.data.comment).toBe('Re-sampled after rain');
    expect(second.body.data.endTimestamp).toBe(endTimestamp);
  });

  it('stays idempotent — a repeated upload does not duplicate samples', async () => {
    const body = sessionBody({
      samples: [{ timestamp: 1750669200000, turbidityValue: 42, probeRange: 'R2' }],
    });
    const id = body.id as string;

    const first = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(first.status).toBe(201);
    createdSessionIds.push(id);
    expect(first.body.data.sampleCount).toBe(1);

    const second = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.sampleCount).toBe(1);
  });

  // ── regression: the validated DTOs must not strip payload fields ──────────

  it('persists every sample field through the whitelisting pipe', async () => {
    const ts = Date.now();
    const body = sessionBody({
      samples: [
        {
          timestamp: ts,
          turbidityValue: 245.5,
          temperatureValue: 18.4,
          probeRange: 'R2',
          locationLat: -27.4698,
          locationLng: 153.0251,
          batteryLevel: 85,
          batteryRawVoltage: 3.9,
          batteryCharging: true,
          demoModeEnabled: false,
        },
      ],
    });
    const id = body.id as string;
    const res = await request(http).post('/v1/sessions').set(auth()).send(body);
    expect(res.status).toBe(201);
    createdSessionIds.push(id);

    const samples = await request(http).get(`/v1/sessions/${id}/samples`).set(auth());
    const s = samples.body.data[0];
    expect(s.turbidityValue).toBe(245.5);
    expect(s.temperatureValue).toBe(18.4);
    expect(s.probeRange).toBe('R2');
    expect(s.locationLat).toBeCloseTo(-27.4698);
    expect(s.locationLng).toBeCloseTo(153.0251);
    expect(s.batteryLevel).toBe(85);
    expect(s.batteryRawVoltage).toBe(3.9);
    expect(s.batteryCharging).toBe(true);
    expect(res.body.data.hasGpsData).toBe(true);
  });

  it('MET sync upload still round-trips its measures through SyncUploadDto', async () => {
    const res = await request(http)
      .post('/v1/sync/upload')
      .set(auth())
      .send({
        type: 'met_record',
        deviceId: metDeviceId,
        deviceName: 'MET-LINK-TEST',
        dateStart: '2026-05-01 14:00:00',
        dateEnd: '2026-05-01 15:00:00',
        localRecordId: 987654,
        measures: [
          {
            dataSentence: 'Wind speed,Unit,Description,Temperature,Unit,Description',
            timeStamp: '2026-05-01 14:00:00',
          },
          { dataSentence: '12.5,m/s,relative,23.4,°C,TEMP', timeStamp: '2026-05-01 14:00:01' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('met_record');
    // The critical assertion: measures survived the whitelist.
    expect(res.body.data.measuresInserted).toBe(2);
  });

  it('NEP sync upload still round-trips its samples through SyncUploadDto', async () => {
    const sessionId = randomUUID();
    const res = await request(http)
      .post('/v1/sync/upload')
      .set(auth())
      .send({
        type: 'nep_session',
        sessionId,
        deviceId: nepDeviceId,
        deviceName: 'NEP-LINK-TEST',
        startTimestamp: Date.now(),
        timezoneName: 'Australia/Brisbane',
        timezoneOffset: 10,
        samples: [{ timestamp: Date.now(), turbidityValue: 5000, probeRange: 'R1' }],
      });

    expect(res.status).toBe(201);
    createdSessionIds.push(sessionId);
    expect(res.body.data.samplesInserted).toBe(1);
    expect(res.body.data.session.probeRange).toBe('R1');
  });
});
