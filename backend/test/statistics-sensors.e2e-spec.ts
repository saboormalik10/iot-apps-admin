import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { User } from '../src/models/User';
import { AnalyticsService } from '../src/analytics/analytics.service';

/**
 * Statistics must work for EVERY sensor, not just wind.
 *
 * It did not. The Beaufort breakdown is wind-only, and the other sensors asked
 * for it anyway with `[{ $limit: 0 }]` standing in for "give me nothing" — but
 * MongoDB rejects a zero limit outright ("the limit must be positive"), so the
 * whole aggregation failed and every non-wind sensor returned an error.
 *
 * It stayed hidden because the panel defaults to wind speed and, until the
 * environmental stream landed, the station reported nothing else — so nobody
 * ever selected another sensor against real data.
 *
 * Built on a throwaway station: sibling specs in this repo have twice disturbed
 * the customer's own data by reusing theirs.
 */
jest.setTimeout(180_000);

const SENSORS = ['wind_speed', 'temperature', 'humidity', 'pressure', 'dew_point'] as const;

describe('statistics across every sensor (e2e)', () => {
  let app: INestApplication;
  let analytics: AnalyticsService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;
  let from: number;
  let to: number;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    analytics = app.get(AnalyticsService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = user!.organizationId as mongoose.Types.ObjectId;

    const device = await Device.create({
      organizationId: orgId,
      name: 'STATS-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `STATS-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;

    const base = Date.now() - 60 * 60_000;
    from = base - 60_000;
    to = Date.now();

    const record = await MetRecord.create({
      organizationId: orgId,
      deviceId,
      deviceName: 'STATS-TEST throwaway station',
      dateStart: new Date(base).toISOString(),
      dateStartMs: base,
      dateEndMs: null,
      measureCount: 0,
      source: 'sftp',
    });
    recordId = record._id as mongoose.Types.ObjectId;

    // Enough rows for percentiles and skewness to be meaningful.
    await MetMeasure.insertMany(
      Array.from({ length: 40 }, (_, i) => ({
        recordId,
        organizationId: orgId,
        rowType: 'data',
        timeStamp: new Date(base + i * 60_000).toISOString(),
        timestampMs: base + i * 60_000,
        dataSentence: 'test',
        source: 'sftp',
        windSpeedMs: 1 + (i % 5) * 0.5,
        windDirTrueDeg: (i * 9) % 360,
        tempC: 10 + (i % 7) * 0.5,
        humidityPct: 60 + (i % 11),
        pressureHpa: 1010 + (i % 9) * 0.4,
        dewPointC: 5 + (i % 6) * 0.3,
      })),
    );
  });

  afterAll(async () => {
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const stats = (sensor: string) =>
    analytics.metStatistics(String(orgId), String(deviceId), sensor, String(from), String(to)) as Promise<
      Record<string, unknown>
    >;

  it.each(SENSORS)('returns real statistics for %s', async (sensor) => {
    // Before the fix this THREW for everything but wind_speed.
    const out = await stats(sensor);
    expect(out.count).toBe(40);
    expect(typeof out.mean).toBe('number');
    expect(typeof out.median).toBe('number');
    expect(typeof out.stdDev).toBe('number');
    expect(out.min).not.toBeNull();
    expect(out.max).not.toBeNull();
    // Percentiles come from the same facet, so a broken pipeline loses these too.
    expect(typeof out.p90).toBe('number');
  });

  it('gives the Beaufort breakdown to wind, and to nothing else', async () => {
    // It is a wind scale. Asking for it on temperature is what broke the query.
    const wind = await stats('wind_speed');
    expect(Array.isArray(wind.beaufortBreakdown)).toBe(true);
    expect((wind.beaufortBreakdown as unknown[]).length).toBeGreaterThan(0);

    for (const sensor of ['temperature', 'humidity', 'pressure', 'dew_point']) {
      const out = await stats(sensor);
      expect(out.beaufortBreakdown ?? null).toBeNull();
    }
  });

  it('labels each sensor with its own unit', async () => {
    expect((await stats('temperature')).unit).toBe('°C');
    expect((await stats('humidity')).unit).toBe('%');
    expect((await stats('pressure')).unit).toBe('hPa');
    expect((await stats('wind_speed')).unit).toBe('m/s');
  });

  it('returns an empty result, not an error, for a window with no data', async () => {
    const out = (await analytics.metStatistics(
      String(orgId),
      String(deviceId),
      'temperature',
      String(from - 400 * 86_400_000),
      String(from - 399 * 86_400_000),
    )) as Record<string, unknown>;
    expect(out.count).toBe(0);
  });
});
