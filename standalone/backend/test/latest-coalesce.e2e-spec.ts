import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { User } from '../src/models/User';
import { DashboardService } from '../src/dashboard/dashboard.service';

/**
 * A station writing two streams into one day record must still have ONE current
 * condition.
 *
 * Wind arrives at 1 Hz and environmental once a minute, as separate rows at
 * different timestamps. Reading "latest" as the newest row alone returns wind
 * with a null temperature, or temperature with a null wind, alternating — the
 * live panel flickers between two half-empty states instead of showing the
 * station.
 *
 * Built on a throwaway device: earlier specs in this repo fired the customer's
 * real alert rules by reusing their station.
 */
jest.setTimeout(120_000);

describe('latest reading coalescing (e2e)', () => {
  let app: INestApplication;
  let service: DashboardService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;
  let base: number;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(DashboardService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = user!.organizationId as mongoose.Types.ObjectId;

    const device = await Device.create({
      organizationId: orgId,
      name: 'COALESCE-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `COALESCE-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;

    base = Date.now() - 5 * 60_000;
    const record = await MetRecord.create({
      organizationId: orgId,
      deviceId,
      deviceName: 'COALESCE-TEST throwaway station',
      dateStart: new Date(base).toISOString(),
      dateStartMs: base,
      dateEndMs: null,
      measureCount: 0,
      source: 'sftp',
    });
    recordId = record._id as mongoose.Types.ObjectId;

    const row = (tsMs: number, fields: Record<string, unknown>) => ({
      recordId,
      organizationId: orgId,
      rowType: 'data',
      timeStamp: new Date(tsMs).toISOString(),
      timestampMs: tsMs,
      dataSentence: 'test',
      source: 'sftp',
      ...fields,
    });

    // Environmental first, then wind a minute later — so the NEWEST row carries
    // wind and no atmosphere, which is the failing shape.
    await MetMeasure.insertMany([
      row(base + 60_000, { tempC: 11.14, humidityPct: 71.19, pressureHpa: 1018.06, dewPointC: 6.1 }),
      row(base + 120_000, { windSpeedMs: 1.31, windSpeedKmh: 4.72, windDirRelDeg: 284 }),
    ]);
  });

  afterAll(async () => {
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  type Latest = Record<string, number | null | undefined>;
  const latest = () =>
    service.getMetLatest(String(orgId), String(deviceId)) as unknown as Promise<Latest | null>;

  it('returns wind AND atmosphere, though they came from different rows', async () => {
    const out = await latest();
    expect(out).not.toBeNull();
    // From the newest row.
    expect(out!.windSpeedMs).toBe(1.31);
    // From the row before it — this is what fails without coalescing.
    expect(out!.tempC).toBe(11.14);
    expect(out!.humidityPct).toBe(71.19);
    expect(out!.pressureHpa).toBe(1018.06);
    expect(out!.dewPointC).toBe(6.1);
  });

  it('reports the freshness of the NEWEST row, not of the value it carried forward', async () => {
    const out = await latest();
    // Otherwise the live panel would claim the station last spoke a minute
    // earlier than it did.
    expect(out!.measuredAtMs).toBe(base + 120_000);
  });

  it('does not invent a reading the station never sent', async () => {
    const out = await latest();
    // Nothing in either row carries solar, so it must stay null rather than
    // being filled from somewhere.
    expect(out!.solarWm2 ?? null).toBeNull();
  });
});
