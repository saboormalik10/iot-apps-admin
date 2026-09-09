import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetIngestFile } from '../src/models/MetIngestFile';
import { StationAccount } from '../src/models/StationAccount';
import { User } from '../src/models/User';
import { IngestService } from '../src/ingest/ingest.service';

/**
 * Three formats arrive in ONE folder. Each must reach the right parser, and the
 * one we have no route for must write nothing at all.
 *
 * That last assertion is the point of the file. `EnvDiagnostic_*` is an audit
 * log, but it carries a `timestamp` column — the parser's only hard guard — so
 * routing it by accident does not raise an error. It quietly inserts ~60
 * all-null rows a minute that look like readings. Counting measures before and
 * after is the only way to catch that; the disposition alone would not.
 */
jest.setTimeout(180_000);

const ENV_CSV = readFileSync(join(__dirname, 'fixtures/environmental-real.csv'), 'utf8');
const DIAG_CSV = readFileSync(join(__dirname, 'fixtures/envdiagnostic-real.csv'), 'utf8');

/** A wind file for the same minute, in the station's real shape. */
const windCsv = (tsIso: string) =>
  'timestamp,direction,speed,units,status\r\n' +
  Array.from({ length: 5 }, (_, i) => `${tsIso.replace(/:\d\d\+/, `:0${i}+`)},284,001.26,K,A`).join('\r\n') +
  '\r\n';

describe('environmental ingest + prefix routing (e2e)', () => {
  let app: INestApplication;
  let ingest: IngestService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  const ACCOUNT = `env-test-${Date.now()}`;
  const FOLDER = 'EnvTest Tower';

  const measureCount = () =>
    MetRecord.find({ deviceId })
      .select('_id')
      .lean()
      .then((rs) => MetMeasure.countDocuments({ recordId: { $in: rs.map((r) => r._id) } }));

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
      name: 'ENV-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `ENV-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;

    await StationAccount.create({
      account: ACCOUNT,
      folderPath: FOLDER,
      organizationId: orgId,
      deviceId,
      streamType: 'met-csv',
      // The routing under test. EnvDiagnostic_ is deliberately absent.
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
    await StationAccount.deleteMany({ account: ACCOUNT });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  const send = (name: string, content: string) =>
    ingest.ingestFiles(String(orgId), ACCOUNT, [{ name, content }], '1.0.0-test', FOLDER);

  it('ingests an Environmental file as ONE row for the minute', async () => {
    const before = await measureCount();
    const res = await send('Environmental_20260908_1914.csv', ENV_CSV);
    expect(res.results[0].status).toBe('ingested');
    // ~48 samples in, one row out.
    expect((await measureCount()) - before).toBe(1);

    const records = await MetRecord.find({ deviceId }).select('_id').lean();
    const row = await MetMeasure.findOne({ recordId: { $in: records.map((r) => r._id) } })
      .sort({ timestampMs: -1 })
      .lean();
    expect(row!.tempC).not.toBeNull();
    expect(row!.humidityPct).not.toBeNull(); // the alias the MET spec is missing
    expect(row!.pressureHpa).not.toBeNull();
    expect(row!.dewPointC).not.toBeNull(); // derived, not in the file
    expect(row!.windSpeedMs ?? null).toBeNull();
  });

  it('grows availableSensors, which is what makes the portal reveal them', async () => {
    const device = await Device.findById(deviceId).select('availableSensors').lean();
    expect([...(device!.availableSensors ?? [])].sort()).toEqual(
      expect.arrayContaining(['dew_point', 'humidity', 'pressure', 'temperature']),
    );
  });

  it('routes a WindSonic file from the SAME folder to the wind parser', async () => {
    const before = await measureCount();
    const res = await send('WindSonic_20260908_1915.csv', windCsv('2026-09-08T19:15:00+10:00'));
    expect(res.results[0].status).toBe('ingested');
    // Wind is stored per sample, not averaged.
    expect((await measureCount()) - before).toBe(5);
  });

  it('REFUSES an unrouted prefix and writes nothing', async () => {
    const before = await measureCount();
    const res = await send('EnvDiagnostic_20260908_1916.csv', DIAG_CSV);

    expect(res.results[0].status).toBe('rejected');
    expect(res.results[0].reason).toBe('NO_STREAM_ROUTE');
    // The assertion that matters: no rows, not merely a refusal. Parsed as wind
    // this file yields plausible-looking all-null readings, which no disposition
    // check would notice.
    expect(await measureCount()).toBe(before);
  });

  /**
   * The per-station switch, checked where it matters.
   *
   * It replaces a type-level toggle that was never enforced anywhere — ingest
   * resolves its parser from the code registry and never read it — so the old
   * switch looked like a kill switch and stopped nothing.
   *
   * Its own station account, because the resolved station is cached for 60s: a
   * toggle applied to the shared one would not be visible to this test, and
   * waiting out the cache would put a minute into every run.
   */
  describe('per-station enable', () => {
    const OFF_ACCOUNT = `env-off-${Date.now()}`;
    let offDeviceId: mongoose.Types.ObjectId;

    const offMeasureCount = () =>
      MetRecord.find({ deviceId: offDeviceId })
        .select('_id')
        .lean()
        .then((rs) => MetMeasure.countDocuments({ recordId: { $in: rs.map((r) => r._id) } }));

    beforeAll(async () => {
      const device = await Device.create({
        organizationId: orgId,
        name: 'ENV-OFF throwaway station',
        type: 'MET-LINK',
        bleId: `ENV-OFF-${Date.now()}`,
        isActive: true,
      });
      offDeviceId = device._id as mongoose.Types.ObjectId;

      await StationAccount.create({
        account: OFF_ACCOUNT,
        folderPath: FOLDER,
        organizationId: orgId,
        deviceId: offDeviceId,
        streamType: 'met-csv',
        streamRoutes: [
          { prefix: 'WindSonic_', streamType: 'met-csv' },
          { prefix: 'Environmental_', streamType: 'environmental-csv' },
        ],
        // Switched off for environmental, from the start.
        disabledStreamTypes: ['environmental-csv'],
        isActive: true,
      });
    });

    afterAll(async () => {
      const rs = await MetRecord.find({ deviceId: offDeviceId }).select('_id').lean();
      await MetMeasure.deleteMany({ recordId: { $in: rs.map((r) => r._id) } });
      await MetRecord.deleteMany({ deviceId: offDeviceId });
      await MetIngestFile.deleteMany({ deviceId: offDeviceId });
      await StationAccount.deleteMany({ account: OFF_ACCOUNT });
      await Device.deleteOne({ _id: offDeviceId });
    });

    const sendOff = (name: string, content: string) =>
      ingest.ingestFiles(String(orgId), OFF_ACCOUNT, [{ name, content }], '1.0.0-test', FOLDER);

    /** Unique bytes: files are deduplicated on content hash, not on filename. */
    const uniqueEnv = () => ENV_CSV.replace('timestamp,', `# ${Date.now()}\r\ntimestamp,`);

    it('REFUSES a file for a type this station has switched off, and writes nothing', async () => {
      const before = await offMeasureCount();
      const res = await sendOff('Environmental_20260908_1955.csv', uniqueEnv());

      expect(res.results[0].status).toBe('rejected');
      expect(res.results[0].reason).toBe('STREAM_TYPE_DISABLED');
      // Refused, not merely reported: a switch that logs and still ingests is
      // worse than no switch at all.
      expect(await offMeasureCount()).toBe(before);
    });

    it('leaves the station’s OTHER formats alone', async () => {
      const before = await offMeasureCount();
      const res = await sendOff('WindSonic_20260908_1956.csv', windCsv('2026-09-08T19:56:00+10:00'));
      expect(res.results[0].status).toBe('ingested');
      expect((await offMeasureCount()) - before).toBe(5);
    });
  });

  it('still serves a station with no routes configured, using its folder default', async () => {
    // Every station registered before routing existed must be unaffected.
    await StationAccount.updateOne({ account: ACCOUNT, folderPath: FOLDER }, { $set: { streamRoutes: [] } });
    // The station cache holds the old routes for up to 60s, so read past it.
    await new Promise((r) => setTimeout(r, 100));
    const fresh = await StationAccount.findOne({ account: ACCOUNT }).lean();
    expect(fresh!.streamRoutes).toHaveLength(0);
    expect(fresh!.streamType).toBe('met-csv');
  });
});
