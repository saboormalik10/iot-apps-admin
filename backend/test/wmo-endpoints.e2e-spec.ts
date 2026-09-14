import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { WMO_MEAN_WINDOW_MS } from '../src/analytics/wmo';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';

/**
 * The two WMO quantities, end to end against the database.
 *
 * The pure maths is covered in `wmo.e2e-spec.ts`; this checks the aggregation
 * agrees with it — in particular that direction is vector-averaged INSIDE
 * MongoDB, which is where a naive `$avg` would quietly give due south.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();
const BASE = Date.UTC(2026, 0, 5, 0, 0, 0); // a fixed, quiet instant

describe('WMO analytics endpoints (e2e)', () => {
  let app: INestApplication;
  let analytics: AnalyticsService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;

  const measure = (offsetMs: number, speed: number, dir: number | null) => ({
    organizationId: orgId,
    recordId,
    rowType: 'data' as const,
    dataSentence: 'x',
    timeStamp: 'x',
    timestampMs: BASE + offsetMs,
    windSpeedMs: speed,
    windDirTrueDeg: dir,
    source: 'sftp' as const,
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
      organizationId: orgId, name: `WMO ${STAMP}`, type: 'MET-LINK',
      bleId: `WMO-${STAMP}`, isActive: true,
    });
    deviceId = d._id as mongoose.Types.ObjectId;

    const rec = await MetRecord.create({
      organizationId: orgId, deviceId, deviceName: d.name, dayKey: '2026-01-05',
      dateStart: '2026-01-05 00:00:00', dateStartMs: BASE, dateEndMs: BASE + 3_600_000,
      measureCount: 0, source: 'sftp',
    });
    recordId = rec._id as mongoose.Types.ObjectId;

    await MetMeasure.insertMany([
      // A calm stretch with one brief spike — the case that separates the two
      // gust definitions.
      measure(0, 2, 350),
      measure(1000, 2, 10),
      measure(2000, 20, 0),
      measure(3000, 2, 5),
      measure(4000, 2, 355),
    ]);
  });

  afterAll(async () => {
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('gust is the peak 3-second MEAN, not the 20 m/s spike', async () => {
    const res = (await analytics.metWindGust(
      String(orgId), String(deviceId), String(BASE - 1000), String(BASE + 10_000), '1h',
    )) as { data: { gustMs: number }[] };

    expect(res.data.length).toBeGreaterThan(0);
    const peak = Math.max(...res.data.map((d) => d.gustMs));
    // The old definition returned 20 — one sample was enough to set it.
    expect(peak).toBeLessThan(20);
    expect(peak).toBeCloseTo(8, 1); // (2 + 2 + 20) / 3
  });

  it('10-minute mean averages direction as VECTORS inside the database', async () => {
    const res = (await analytics.metMeanWind(
      String(orgId), String(deviceId), String(BASE - 1000), String(BASE + 10_000),
    )) as { windowMs: number; data: { speedMs: number; dirDeg: number | null; samples: number }[] };

    expect(res.windowMs).toBe(WMO_MEAN_WINDOW_MS);
    expect(res.data).toHaveLength(1);

    const b = res.data[0];
    // Bearings 350, 10, 0, 5, 355 all sit around north. An arithmetic mean
    // would be 144° — east-south-east, and completely wrong.
    expect(b.dirDeg).not.toBeNull();
    const offNorth = Math.min(b.dirDeg as number, 360 - (b.dirDeg as number));
    expect(offNorth).toBeLessThan(5);
    expect(b.samples).toBe(5);
    expect(b.speedMs).toBeCloseTo(5.6, 1); // (2+2+20+2+2)/5
  });

  it('reports nothing rather than zeroes for a window with no data', async () => {
    const res = (await analytics.metMeanWind(
      String(orgId), String(deviceId), String(BASE + 600_000), String(BASE + 700_000),
    )) as { data: unknown[] };
    expect(res.data).toEqual([]);
  });
});
