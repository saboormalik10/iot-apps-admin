import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { User } from '../src/models/User';
import { RecordsService } from '../src/records/records.service';

/**
 * The records list filters by OVERLAP, not by when the record started.
 *
 * A `MetRecord` is one document per station per LOCAL DAY, so it spans hours.
 * Matching the window against `dateStartMs` asked "did the day BEGIN in this
 * window?" — false for every range shorter than a day. `?range=1h` returned an
 * empty list while the open day record held that exact hour.
 *
 * Built on a THROWAWAY device so the customer's own records are never counted.
 */
jest.setTimeout(120_000);

const H = 3_600_000;

describe('records range filter (e2e)', () => {
  let app: INestApplication;
  let service: RecordsService;
  let orgId: string;
  let deviceId: mongoose.Types.ObjectId;
  let now: number;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(RecordsService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = String(user!.organizationId);

    const device = await Device.create({
      organizationId: user!.organizationId,
      name: 'RANGE-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `RANGE-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;
    now = Date.now();

    const mk = (startMs: number, endMs: number | null) =>
      MetRecord.create({
        organizationId: user!.organizationId,
        deviceId,
        deviceName: 'RANGE-TEST throwaway station',
        dateStart: new Date(startMs).toISOString(),
        dateStartMs: startMs,
        dateEndMs: endMs,
        measureCount: 10,
        source: 'sftp',
      });

    // Today, still being written — began 20 hours ago, no end yet.
    const open = await mk(now - 20 * H, null);
    // Real measures so `measuresInRange` counts something: two inside the last
    // 90 minutes, one well before it.
    await MetMeasure.insertMany(
      [now - 30 * 60_000, now - 60 * 60_000, now - 10 * H].map((ts) => ({
        recordId: open._id,
        organizationId: new mongoose.Types.ObjectId(orgId),
        rowType: 'data',
        timeStamp: new Date(ts).toISOString(),
        timestampMs: ts,
        dataSentence: '$IIMWV,000,R,001.00,M,A*00',
        windSpeedMs: 1,
        source: 'sftp',
      })),
    );
    // Yesterday, closed.
    await mk(now - 44 * H, now - 20 * H - 1);
    // Long finished, well outside any recent window.
    await mk(now - 400 * H, now - 376 * H);
  });

  afterAll(async () => {
    const mine = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: mine.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const list = (from?: number, to?: number) =>
    service.listRecords({ organizationId: orgId, deviceId: String(deviceId), from, to, page: 1, limit: 20 });

  it('finds the OPEN day record for a one-hour window inside it', async () => {
    // The defect: this record started 20 hours ago, so a `dateStartMs >= from`
    // test excluded it and the page rendered empty.
    const res = await list(now - H, now);
    expect(res.meta.total).toBe(1);
    expect(res.data[0].dateEndMs).toBeNull();
  });

  it('finds both the open day and yesterday over 24 hours', async () => {
    const res = await list(now - 24 * H, now);
    expect(res.meta.total).toBe(2);
  });

  it('still EXCLUDES a record that ended before the window', async () => {
    // The fix must not simply widen everything — a range has to keep filtering.
    const res = await list(now - 2 * H, now);
    const ids = res.data.map((r) => r.dateStartMs);
    expect(ids).not.toContain(now - 400 * H);
    expect(res.meta.total).toBe(1);
  });

  it('excludes everything for a window that predates the data', async () => {
    const res = await list(now - 500 * H, now - 450 * H);
    expect(res.meta.total).toBe(0);
  });

  it('excludes a record that starts AFTER the window ends', async () => {
    const res = await list(now - 500 * H, now - 401 * H);
    expect(res.meta.total).toBe(0);
  });

  /**
   * The row must describe the SELECTION, not just the day.
   *
   * The reported symptom: picking "last hour" showed the record, but the
   * Measures column still read the whole day's total, so the page appeared to
   * ignore the filter it had in fact applied.
   */
  describe('measuresInRange', () => {
    it('counts only the readings inside the window', async () => {
      const res = await list(now - 90 * 60_000, now);
      const open = res.data.find((r) => r.dateEndMs === null)!;
      // Two of the three seeded readings sit inside the last 90 minutes.
      expect(open.measuresInRange).toBe(2);
      expect(open.measureCount).toBe(10);
    });

    it('is absent when no window was requested, so the row shows the day total', async () => {
      const res = await list();
      for (const r of res.data) expect(r.measuresInRange).toBeUndefined();
    });

    it('reports 0 rather than hiding a record with nothing in the window', async () => {
      // The record still overlaps the range; "0 in range" is the answer to why
      // it looks empty, and dropping the row would just move the confusion.
      const res = await list(now - 19 * H, now - 18 * H);
      const open = res.data.find((r) => r.dateEndMs === null);
      expect(open?.measuresInRange).toBe(0);
    });
  });

  it('returns everything when no window is given', async () => {
    const res = await list();
    expect(res.meta.total).toBe(3);
  });
});
