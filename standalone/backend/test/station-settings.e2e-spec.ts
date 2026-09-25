import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import mongoose from 'mongoose';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Device } from '../src/models/Device';

/**
 * Editing the station. The body is validated now (it used to reach Mongoose
 * unchecked), and the heading offset — which nothing could set once SFTP
 * provisioning was removed — can be set.
 */
describe('Station settings (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let token: string;
  let viewerToken: string;
  let id: string;
  let before: { headingOffsetDeg: number; rainDayStartHour: number; customName: string | null };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();
    token = (await request(http).post('/v1/auth/login').send({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' })).body.data.accessToken;
    viewerToken = (await request(http).post('/v1/auth/login').send({ email: 'viewer@observator.com', password: process.env.E2E_VIEWER_PASSWORD ?? 'Viewer@1234' })).body.data.accessToken;
    const d = await Device.findOne({ bleId: 'MET-00:11:22:33:44:55' }).lean();
    id = String(d!._id);
    before = { headingOffsetDeg: d!.headingOffsetDeg ?? 0, rainDayStartHour: d!.rainDayStartHour ?? 0, customName: d!.customName ?? null };
  });

  afterAll(async () => {
    await Device.updateOne({ _id: id }, { $set: before });
    await app?.close();
    await mongoose.disconnect();
  });

  const patch = (body: object, t = token) => request(http).patch(`/v1/devices/${id}`).set('Authorization', `Bearer ${t}`).send(body);

  it('sets the heading offset, stored as 0–359.9', async () => {
    expect((await patch({ headingOffsetDeg: 11.54 })).status).toBe(200);
    expect((await Device.findById(id).lean())!.headingOffsetDeg).toBe(11.5);
    expect((await patch({ headingOffsetDeg: -12 })).status).toBe(200);
    expect((await Device.findById(id).lean())!.headingOffsetDeg).toBe(348);
  });

  it('refuses an offset out of range or not a number', async () => {
    expect((await patch({ headingOffsetDeg: 400 })).status).toBe(400);
    expect((await patch({ headingOffsetDeg: 'north' })).status).toBe(400);
  });

  it('refuses wrong types instead of passing them to the database', async () => {
    expect((await patch({ customName: { $gt: '' } })).status).toBe(400);
    expect((await patch({ storeRawSamples: 'yes' })).status).toBe(400);
    expect((await patch({ rainDayStartHour: 9.5 })).status).toBe(400);
    expect((await patch({ customName: 'x'.repeat(121) })).status).toBe(400);
  });

  it('refuses control characters in a name', async () => {
    /**
     * QA named a station `Nul\u0000Test\u0007Bell` through the API and it was stored
     * exactly as sent: invisible on screen, and a NUL byte every later reader —
     * the logs, the audit trail, an export's file name — has to cope with.
     * 24 Sep 2026.
     */
    expect((await patch({ name: 'Nul\u0000Test' })).status).toBe(400);
    expect((await patch({ customName: 'Bell\u0007' })).status).toBe(400);
    expect((await patch({ serialNo: 'A\u001bB' })).status).toBe(400);
    // Ordinary names, including accents and punctuation, are untouched.
    expect((await patch({ customName: 'Mât nord — #2' })).status).toBe(200);
  });

  it('still takes a normal edit, and still needs device:write', async () => {
    const ok = await patch({ customName: 'North mast', rainDayStartHour: 9 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ customName: 'North mast', rainDayStartHour: 9 });
    expect((await patch({ customName: 'Nope' }, viewerToken)).status).toBe(403);
  });
});
