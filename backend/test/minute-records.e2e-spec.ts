import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { User } from '../src/models/User';
import { StationAccount } from '../src/models/StationAccount';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetIngestFile } from '../src/models/MetIngestFile';
import { MetRawSample } from '../src/models/MetRawSample';
import { IngestService } from '../src/ingest/ingest.service';

/**
 * One record per station per minute, end to end.
 *
 * The unit tests cover the arithmetic; this covers the things only the real
 * write path can show — that the two streams land on ONE row, that the rolling
 * means survive a file boundary, and that re-sending a file does not duplicate
 * the minute.
 */

const ACCOUNT = `min-test-${Date.now()}`;
const FOLDER = 'MinTest Tower';

/** A minute of 1 Hz wind at a fixed speed, in km/h as the station writes it. */
const windCsv = (minuteIso: string, speedKmh: number, dirDeg = 90, n = 60) =>
  'timestamp,direction,speed,units,status\r\n' +
  Array.from({ length: n }, (_, i) => {
    const ts = minuteIso.replace(/:00\+/, `:${String(i).padStart(2, '0')}+`);
    return `${ts},${dirDeg},${speedKmh.toFixed(2)},K,A`;
  }).join('\r\n') +
  '\r\n';

const envCsv = (minuteIso: string) =>
  'timestamp,temperature_C,humidity_percent,pressure_hPa\r\n' + `${minuteIso},18.50,61.00,1013.20\r\n`;

describe('minute records (e2e)', () => {
  let app: INestApplication;
  let ingest: IngestService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;

  const send = (name: string, content: string) =>
    ingest.ingestFiles(String(orgId), ACCOUNT, [{ name, content }], '1.0.0-test', FOLDER);

  const minuteRows = () =>
    MetRecord.find({ deviceId })
      .select('_id')
      .lean()
      .then((rs) =>
        MetMeasure.find({ recordId: { $in: rs.map((r) => r._id) } }).sort({ timestampMs: 1 }).lean(),
      );

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
      bleId: `MIN-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;

    await StationAccount.create({
      account: ACCOUNT,
      folderPath: FOLDER,
      organizationId: orgId,
      deviceId,
      streamType: 'met-csv',
      streamRoutes: [
        { prefix: 'WindSonic_', streamType: 'met-csv' },
        { prefix: 'Environmental_', streamType: 'environmental-csv' },
      ],
      isActive: true,
    });
  });

  afterAll(async () => {
    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    await MetMeasure.deleteMany({ recordId: { $in: records.map((r) => r._id) } });
    await MetRecord.deleteMany({ deviceId });
    await MetIngestFile.deleteMany({ deviceId });
    await MetRawSample.deleteMany({ deviceId });
    await StationAccount.deleteMany({ account: ACCOUNT });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('writes ONE record for a minute of 1 Hz wind', async () => {
    const res = await send('WindSonic_20260901_0100.csv', windCsv('2026-09-01T01:00:00+10:00', 18));
    expect(res.results[0].status).toBe('ingested');

    const rows = await minuteRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].res).toBe('1m');
    expect(rows[0].windSampleCount).toBe(60);
    expect(rows[0].windSpeedMs).toBeCloseTo(5, 2); // 18 km/h
    expect(rows[0].windGustMs).toBeCloseTo(5, 2);  // steady wind: gust equals mean
  });

  it('merges the environmental file for the SAME minute into that record', async () => {
    /**
     * Wind and environmental arrive as separate files. They used to land as two
     * half-empty rows for the same instant, which the FRONTEND then had to
     * stitch back together for display. The minute record is upserted, so the
     * second file merges into the first file's row.
     */
    const res = await send('Environmental_20260901_0100.csv', envCsv('2026-09-01T01:00:00+10:00'));
    expect(res.results[0].status).toBe('ingested');

    const rows = await minuteRows();
    expect(rows).toHaveLength(1); // still ONE row for the minute
    expect(rows[0].windSpeedMs).toBeCloseTo(5, 2); // wind survived the merge
    expect(rows[0].tempC).toBe(18.5);
    expect(rows[0].humidityPct).toBe(61);
    expect(rows[0].pressureHpa).toBe(1013.2);
  });

  it('re-sending the same minute does not create a second record', async () => {
    // Guarded by a unique index, not just by the upsert filter.
    await send('WindSonic_20260901_0100_again.csv', windCsv('2026-09-01T01:00:00+10:00', 18));
    const rows = await minuteRows();
    expect(rows.filter((r) => r.timestampMs === rows[0].timestampMs)).toHaveLength(1);
  });

  it('builds the 2- and 10-minute means across file boundaries', async () => {
    /**
     * The load-bearing case. Each file is one minute, so these windows can only
     * be built from minutes already written — and the API is serverless, so an
     * in-process buffer could not be relied on to hold them.
     */
    for (let m = 1; m <= 9; m++) {
      const iso = `2026-09-01T01:${String(m).padStart(2, '0')}:00+10:00`;
      await send(`WindSonic_20260901_01${String(m).padStart(2, '0')}.csv`, windCsv(iso, 36)); // 10 m/s
    }

    const rows = await minuteRows();
    const last = rows[rows.length - 1];

    // Minute 09 is 10 m/s; minute 08 is also 10 m/s → the 2-minute mean is 10.
    expect(last.windSpeedMean2mMs).toBeCloseTo(10, 1);

    // The 10-minute window reaches back to minute 00, which was 5 m/s. Nine
    // minutes at 10 and one at 5 — so the mean sits just below 10, and is NOT
    // simply the current minute repeated.
    expect(last.windSpeedMean10mMs).toBeLessThan(10);
    expect(last.windSpeedMean10mMs).toBeGreaterThan(9);
    expect(last.windMean10mMinutes).toBe(10);
    expect(last.windDir10mDeg).toBeCloseTo(90, 0);
  });

  it('stores no raw samples unless the station asks for them', async () => {
    // The default. 86,400 rows a day that nothing reads is the thing being fixed.
    expect(await MetRawSample.countDocuments({ deviceId })).toBe(0);
  });

  it('keeps the per-second samples when storeRawSamples is switched on', async () => {
    await Device.updateOne({ _id: deviceId }, { $set: { storeRawSamples: true } });
    // The station cache holds the old flag for its TTL, so address the device
    // directly — the same path the admin upload uses.
    await ingest.ingestForDevice(
      String(orgId),
      String(deviceId),
      'WindSonic_20260901_0200.csv',
      windCsv('2026-09-01T02:00:00+10:00', 18, 90, 10),
    );

    expect(await MetRawSample.countDocuments({ deviceId })).toBe(10);
    // And the minute record is still written — raw storage is IN ADDITION.
    const rows = await minuteRows();
    expect(rows.some((r) => r.timestampMs === Date.parse('2026-09-01T02:00:00+10:00'))).toBe(true);
  });
});
