import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';

/**
 * Comfort indices and fog risk, end to end.
 *
 * Both used to fetch every matching document and bucket it in JavaScript — 86k
 * documents moved across the wire to return 24 numbers, which is why the panels
 * sat on "Loading…". They now `$group` in the database. These tests pin the
 * BEHAVIOUR that rewrite had to preserve: the bucket boundaries, the per-field
 * treatment of gaps, and the derived labels.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();
const BASE = Date.UTC(2026, 0, 6, 0, 0, 0);
const HOUR = 3_600_000;

describe('comfort + fog endpoints (e2e)', () => {
  let app: INestApplication;
  let analytics: AnalyticsService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;

  const measure = (offsetMs: number, fields: Record<string, number>) => ({
    organizationId: orgId,
    recordId,
    rowType: 'data' as const,
    dataSentence: 'x',
    timeStamp: 'x',
    timestampMs: BASE + offsetMs,
    source: 'sftp' as const,
    ...fields,
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    analytics = app.get(AnalyticsService);

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = admin!.organizationId as mongoose.Types.ObjectId;

    const d = await Device.create({
      organizationId: orgId, name: `CF ${STAMP}`, type: 'MET-LINK',
      bleId: `CF-${STAMP}`, isActive: true,
    });
    deviceId = d._id as mongoose.Types.ObjectId;

    const rec = await MetRecord.create({
      organizationId: orgId, deviceId, deviceName: d.name, dayKey: '2026-01-06',
      dateStart: '2026-01-06 00:00:00', dateStartMs: BASE, dateEndMs: BASE + 3 * HOUR,
      measureCount: 0, source: 'sftp',
    });
    recordId = rec._id as mongoose.Types.ObjectId;

    await MetMeasure.insertMany([
      // Hour 0 — two readings, so the bucket mean is their average.
      measure(0, { tempC: 10, humidityPct: 80, windSpeedMs: 2, dewPointC: 6 }),
      measure(60_000, { tempC: 20, humidityPct: 60, windSpeedMs: 4, dewPointC: 10 }),
      // Hour 1 — saturated: temperature equals dew point, so the spread is zero.
      measure(HOUR, { tempC: 12, humidityPct: 100, windSpeedMs: 1, dewPointC: 12 }),
      // Hour 2 — wind but NO temperature or dew point. Present for comfort's
      // wind field, and excluded from fog entirely.
      measure(2 * HOUR, { windSpeedMs: 9 }),
    ]);
  });

  afterAll(async () => {
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const window = () => [String(BASE - 1000), String(BASE + 3 * HOUR)] as const;

  describe('comfort indices', () => {
    it('averages each field within its hour bucket', async () => {
      const [from, to] = window();
      const res = (await analytics.metComfort(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; tempC: number | null; humidityPct: number | null; windSpeedMs: number | null }[];
      };
      const h0 = res.data.find((d) => d.ts === BASE)!;
      expect(h0.tempC).toBe(15); // (10 + 20) / 2
      expect(h0.humidityPct).toBe(70);
      expect(h0.windSpeedMs).toBe(3);
    });

    it('buckets by the hour, not by the reading', async () => {
      const [from, to] = window();
      const res = (await analytics.metComfort(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number }[];
      };
      // Four readings across three hours → three buckets.
      expect(res.data.map((d) => d.ts)).toEqual([BASE, BASE + HOUR, BASE + 2 * HOUR]);
    });

    it('keeps an hour that has wind but no temperature', async () => {
      /**
       * Fields are averaged INDEPENDENTLY. An hour missing temperature must not
       * drop its wind reading — `$avg` skips null per field, exactly as the old
       * per-field arrays did.
       */
      const [from, to] = window();
      const res = (await analytics.metComfort(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; tempC: number | null; windSpeedMs: number | null }[];
      };
      const h2 = res.data.find((d) => d.ts === BASE + 2 * HOUR)!;
      expect(h2.tempC).toBeNull();
      expect(h2.windSpeedMs).toBe(9);
    });

    it('still derives the comfort label from the bucket mean', async () => {
      const [from, to] = window();
      const res = (await analytics.metComfort(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; effectiveTempC: number | null; comfortLabel: string | null }[];
      };
      const h0 = res.data.find((d) => d.ts === BASE)!;
      expect(h0.effectiveTempC).not.toBeNull();
      expect(h0.comfortLabel).toBeTruthy();
    });
  });

  describe('fog risk', () => {
    it('computes the spread from the bucket means', async () => {
      const [from, to] = window();
      const res = (await analytics.metFogRisk(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; tempC: number; dewPointC: number; spread: number }[];
      };
      const h0 = res.data.find((d) => d.ts === BASE)!;
      expect(h0.tempC).toBe(15); // (10 + 20) / 2
      expect(h0.dewPointC).toBe(8); // (6 + 10) / 2
      expect(h0.spread).toBe(7);
    });

    it('flags a zero spread as the highest fog risk', async () => {
      const [from, to] = window();
      const res = (await analytics.metFogRisk(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; spread: number; fogRisk: string }[];
      };
      const h1 = res.data.find((d) => d.ts === BASE + HOUR)!;
      expect(h1.spread).toBe(0);
      expect(h1.fogRisk).toBeTruthy();
    });

    it('drops an hour with no temperature or dew point', async () => {
      // Without both there is no spread to report, and a bucket claiming one
      // would be inventing it. This is the `a.t.length && a.d.length` rule the
      // in-Node version applied.
      const [from, to] = window();
      const res = (await analytics.metFogRisk(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number }[];
      };
      expect(res.data.map((d) => d.ts)).not.toContain(BASE + 2 * HOUR);
      expect(res.data).toHaveLength(2);
    });

    it('carries the humidity mean through', async () => {
      const [from, to] = window();
      const res = (await analytics.metFogRisk(String(orgId), String(deviceId), from, to, '1h')) as {
        data: { ts: number; relativeHumidityPct: number | null }[];
      };
      expect(res.data.find((d) => d.ts === BASE)!.relativeHumidityPct).toBe(70);
    });
  });
});
