import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { IngestService } from '../src/ingest/ingest.service';
import { toMetRow } from '../src/stream/to-met-row';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetRawSample } from '../src/models/MetRawSample';

/**
 * The minute-record pipeline, entered the way the sensor stream enters it.
 *
 * Ported from the cloud's `minute-records` suite, which drove the same pipeline
 * through SFTP files. What it pins is unchanged: one record per minute, a
 * re-sent minute never doubles, and the 2- and 10-minute means are built from
 * minutes already WRITTEN — each call here carries one minute, as the stream
 * does, so the windows can only come from the database.
 *
 * Its own throwaway station, removed afterwards.
 */
jest.setTimeout(60_000);

/** A minute of 1 Hz readings: `n` seconds of steady wind. */
const minuteOf = (minuteMs: number, speedMs: number, dirDeg = 90, n = 60) =>
  Array.from({ length: n }, (_, s) =>
    toMetRow(
      { node: 'Q', status: '0000', raw: `Q,${dirDeg},${speedMs}`, values: { dir: dirDeg, speed: speedMs, temp: 18.5, rh: 61, press: 1013.2 } },
      minuteMs + s * 1000,
      null,
    ),
  );

describe('stream minute records (e2e)', () => {
  let app: INestApplication;
  let ingest: IngestService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  const T0 = Date.parse('2026-09-01T01:00:00+10:00');
  const MIN = 60_000;

  const send = (minuteMs: number, speedMs: number, dirDeg = 90, n = 60) =>
    ingest.ingestStreamRows(String(orgId), String(deviceId), minuteOf(minuteMs, speedMs, dirDeg, n), ['wind_speed', 'wind_dir']);

  const minuteRows = () =>
    MetRecord.find({ deviceId })
      .select('_id')
      .lean()
      .then((rs) => MetMeasure.find({ recordId: { $in: rs.map((r) => r._id) } }).sort({ timestampMs: 1 }).lean());

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ingest = app.get(IngestService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = user!.organizationId as mongoose.Types.ObjectId;
    const device = await Device.create({
      organizationId: orgId,
      name: 'MIN-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `MIN-TEST-${process.pid}`,
    });
    deviceId = device._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetRawSample.deleteMany({ deviceId });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('writes ONE record for a minute of 1 Hz readings, environment included', async () => {
    const out = await send(T0, 5);
    expect(out?.inserted).toBe(1);

    const rows = await minuteRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ res: '1m', source: 'stream', windSampleCount: 60 });
    expect(rows[0].windSpeedMs).toBeCloseTo(5, 2);
    expect(rows[0].windGustMs).toBeCloseTo(5, 2); // steady wind: gust equals mean
    expect(rows[0].tempC).toBe(18.5);
    expect(rows[0].humidityPct).toBe(61);
    expect(rows[0].pressureHpa).toBe(1013.2);
  });

  it('re-sending the same minute does not create a second record', async () => {
    // Guarded by a unique index, not just by the upsert filter.
    const out = await send(T0, 5);
    expect(out?.inserted).toBe(0);
    const rows = await minuteRows();
    expect(rows.filter((r) => r.timestampMs === T0)).toHaveLength(1);
    // …and the day's reading count did not grow.
    const record = await MetRecord.findOne({ deviceId }).lean();
    expect(record!.measureCount).toBe(1);
  });

  it('builds the 2- and 10-minute means from minutes already written', async () => {
    for (let m = 1; m <= 9; m++) await send(T0 + m * MIN, 10);

    const rows = await minuteRows();
    const last = rows[rows.length - 1];
    // Minutes 8 and 9 are both 10 m/s.
    expect(last.windSpeedMean2mMs).toBeCloseTo(10, 1);
    // The 10-minute window reaches back to minute 0 at 5 m/s: nine at 10 and one
    // at 5, so just below 10 — not the current minute repeated.
    expect(last.windSpeedMean10mMs).toBeLessThan(10);
    expect(last.windSpeedMean10mMs).toBeGreaterThan(9);
    expect(last.windMean10mMinutes).toBe(10);
    expect(last.windDir10mDeg).toBeCloseTo(90, 0);
  });

  it('stores no raw samples unless the station asks for them', async () => {
    expect(await MetRawSample.countDocuments({ deviceId })).toBe(0);
  });

  it('keeps the per-second samples when storeRawSamples is switched on', async () => {
    await Device.updateOne({ _id: deviceId }, { $set: { storeRawSamples: true } });
    await send(T0 + 60 * MIN, 5, 90, 10);

    expect(await MetRawSample.countDocuments({ deviceId })).toBe(10);
    // The minute record is still written — raw storage is IN ADDITION.
    const rows = await minuteRows();
    expect(rows.some((r) => r.timestampMs === T0 + 60 * MIN)).toBe(true);
  });

  it('returns null for a station that no longer exists', async () => {
    const out = await ingest.ingestStreamRows(String(orgId), String(new mongoose.Types.ObjectId()), minuteOf(T0, 5), []);
    expect(out).toBeNull();
  });
});
