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
 * The measures endpoint honours the selected range.
 *
 * Without a window, page 1 of a record was its first `limit` readings — the
 * first half hour of a day at 1 Hz — no matter which range the scope bar showed.
 * The chart above the table plotted that slice, so any channel sampled once a
 * minute looked like it had no data, and anything later in the day was
 * unreachable. These tests pin the window, the pagination inside it, and the
 * total count, which is what drives the pager.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();
const BASE = Date.UTC(2026, 0, 7, 0, 0, 0);
const HOUR = 3_600_000;

describe('record measures window (e2e)', () => {
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
      organizationId: orgId, name: `MW ${STAMP}`, type: 'MET-LINK',
      bleId: `MW-${STAMP}`, isActive: true,
    });
    deviceId = d._id as mongoose.Types.ObjectId;

    const rec = await MetRecord.create({
      organizationId: orgId, deviceId, deviceName: d.name, dayKey: '2026-01-07',
      dateStart: '2026-01-07 00:00:00', dateStartMs: BASE, dateEndMs: BASE + 5 * HOUR,
      measureCount: 0, source: 'sftp',
    });
    recordId = rec._id as mongoose.Types.ObjectId;

    // One reading an hour for six hours, each with a distinct temperature so a
    // window can be identified by its contents rather than only its count.
    await MetMeasure.insertMany(
      Array.from({ length: 6 }, (_, h) => ({
        organizationId: orgId, recordId, rowType: 'data' as const,
        dataSentence: 'x', timeStamp: 'x', timestampMs: BASE + h * HOUR,
        tempC: 10 + h, source: 'sftp' as const,
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

  const get = (opts: { from?: number; to?: number; page?: number; limit?: number } = {}) =>
    records.getMeasures({ organizationId: String(orgId), recordId: String(recordId), ...opts });

  it('returns the whole record when no window is given', async () => {
    const res = await get();
    expect(res.meta.total).toBe(6);
  });

  it('returns only the readings inside the window', async () => {
    const res = await get({ from: BASE + 2 * HOUR, to: BASE + 4 * HOUR });
    expect(res.data.map((r) => r.tempC)).toEqual([12, 13, 14]);
  });

  it('counts the WINDOW, not the record', async () => {
    // The pager reads this. Reporting the record's total would offer pages that
    // return nothing once a range is selected.
    const res = await get({ from: BASE + 2 * HOUR, to: BASE + 4 * HOUR });
    expect(res.meta.total).toBe(3);
    expect(res.meta.pages).toBe(1);
  });

  it('is inclusive at both ends', async () => {
    // A reading exactly on the boundary belongs to the window; excluding it
    // silently drops the first or last point of every chart.
    const res = await get({ from: BASE, to: BASE });
    expect(res.data.map((r) => r.tempC)).toEqual([10]);
  });

  it('paginates INSIDE the window', async () => {
    const p1 = await get({ from: BASE, to: BASE + 5 * HOUR, page: 1, limit: 2 });
    const p2 = await get({ from: BASE, to: BASE + 5 * HOUR, page: 2, limit: 2 });
    expect(p1.data.map((r) => r.tempC)).toEqual([10, 11]);
    expect(p2.data.map((r) => r.tempC)).toEqual([12, 13]);
  });

  it('accepts an open-ended window', async () => {
    // "All time" sends no `from`; a half-bounded range must still narrow.
    const res = await get({ from: BASE + 4 * HOUR });
    expect(res.data.map((r) => r.tempC)).toEqual([14, 15]);
  });

  it('returns nothing for a window the record does not cover', async () => {
    const res = await get({ from: BASE + 100 * HOUR, to: BASE + 200 * HOUR });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
  });
});
