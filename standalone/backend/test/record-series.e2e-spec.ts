import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { RecordsService } from '../src/records/records.service';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';

/**
 * The record chart's series.
 *
 * It replaced "read the first N rows", which on a 1 Hz record covered the first
 * half hour — so temperature, humidity, pressure and dew point, all logged once
 * a minute, contributed a few dozen points at the left edge and read as empty
 * while thousands more sat unplotted in the same record. The fixture below
 * reproduces exactly that shape: dense wind, sparse environmental.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();
const BASE = Date.UTC(2026, 0, 8, 0, 0, 0);
const HOUR = 3_600_000;

describe('record chart series (e2e)', () => {
  let app: INestApplication;
  let records: RecordsService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  let recordId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    records = app.get(RecordsService);

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = admin!.organizationId as mongoose.Types.ObjectId;

    const d = await Device.create({
      organizationId: orgId, name: `RS ${STAMP}`, type: 'MET-LINK', bleId: `RS-${STAMP}`, isActive: true,
    });
    deviceId = d._id as mongoose.Types.ObjectId;

    const rec = await MetRecord.create({
      organizationId: orgId, deviceId, deviceName: d.name, dayKey: '2026-01-08',
      dateStart: '2026-01-08 00:00:00', dateStartMs: BASE, dateEndMs: BASE + 6 * HOUR,
      measureCount: 0, source: 'sftp',
    });
    recordId = rec._id as mongoose.Types.ObjectId;

    const base = {
      organizationId: orgId, recordId, rowType: 'data' as const,
      dataSentence: 'x', timeStamp: 'x', source: 'sftp' as const,
    };

    // 1,200 wind readings crammed into the FIRST hour — the density that used to
    // exhaust the row cap before any later reading was seen.
    const wind = Array.from({ length: 1200 }, (_, i) => ({
      ...base, timestampMs: BASE + i * 3000, windSpeedMs: 5,
    }));
    // One environmental reading an hour, across all six hours.
    const env = Array.from({ length: 6 }, (_, h) => ({
      ...base, timestampMs: BASE + h * HOUR + 1, tempC: 10 + h, humidityPct: 50 + h,
    }));
    await MetMeasure.insertMany([...wind, ...env]);
  });

  afterAll(async () => {
    await MetMeasure.deleteMany({ recordId });
    await MetRecord.deleteOne({ _id: recordId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const series = (fields: string[], extra: { from?: number; to?: number; points?: number } = {}) =>
    records.getSeries({ organizationId: String(orgId), recordId: String(recordId), fields, ...extra });

  it('reaches the LAST hour’s temperature, which the row cap never did', async () => {
    /**
     * The regression test for the whole bug. Reading rows oldest-first stopped
     * inside hour one; the final reading of the record was unreachable no matter
     * how the chart was configured.
     */
    const res = await series(['tempC']);
    const temps = res.data.map((b) => b.tempC).filter((v) => v !== null);
    expect(temps).toContain(15); // hour 6
    expect(temps).toContain(10); // hour 1
  });

  it('gives a sparse channel as many points as a dense one', async () => {
    // The point of bucketing. Wind is logged 200x more often than temperature,
    // and that must not decide how much of the chart temperature gets.
    const res = await series(['tempC', 'windSpeedMs']);
    const temps = res.data.filter((b) => b.tempC !== null).length;
    expect(temps).toBe(6);
  });

  it('returns null for a bucket the field had no reading in', async () => {
    // A gap must stay a gap. Zero would draw the line to the floor.
    const res = await series(['tempC'], { points: 100 });
    expect(res.data.some((b) => b.tempC === null)).toBe(true);
  });

  it('averages within the bucket', async () => {
    const res = await series(['windSpeedMs']);
    const vals = res.data.map((b) => b.windSpeedMs).filter((v) => v !== null);
    expect(vals.every((v) => v === 5)).toBe(true);
  });

  it('never buckets finer than a minute, whatever the caller asks', async () => {
    // A minute is the stored resolution; finer buckets only manufacture empties.
    const res = await series(['tempC'], { points: 2000 });
    expect(res.intervalMs).toBeGreaterThanOrEqual(60_000);
  });

  it('narrows to the requested window', async () => {
    const res = await series(['tempC'], { from: BASE + 3 * HOUR, to: BASE + 5 * HOUR });
    const temps = res.data.map((b) => b.tempC).filter((v) => v !== null);
    // Hours 4 and 5 only. The hour-6 reading sits at BASE + 5h + 1ms — one
    // millisecond past the end — and is correctly outside the window.
    expect(temps).toEqual([13, 14]);
  });

  it('ignores a field that is not on the whitelist', async () => {
    /**
     * Field names are interpolated into the aggregation, so an unchecked value
     * would read any field on the document. Unknown names are dropped rather
     * than rejected, so a UI ahead of the API degrades to a missing series.
     */
    const res = await series(['tempC', 'passwordHash', '$where']);
    expect(res.fields).toEqual(['tempC']);
    expect(Object.keys(res.data[0] ?? {})).not.toContain('passwordHash');
  });

  it('returns nothing when no valid field is asked for', async () => {
    const res = await series(['nonsense']);
    expect(res.data).toEqual([]);
  });
});
