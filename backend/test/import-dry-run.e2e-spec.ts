import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { IngestService } from '../src/ingest/ingest.service';
import { Device } from '../src/models/Device';
import { MetMeasure } from '../src/models/MetMeasure';
import { MetRecord } from '../src/models/MetRecord';
import { MetIngestFile } from '../src/models/MetIngestFile';
import { Organization } from '../src/models/Organization';

/**
 * Import dry-run (M22 W4).
 *
 * The wizard commits straight to the live dataset. The two mistakes that hurt
 * are importing the WRONG file and importing the SAME file twice, and both are
 * answerable before the write — so the dry run answers them.
 *
 * It deliberately reuses the same parser and the same content hash as the real
 * path: a dry run computed a different way would be a second implementation to
 * keep in step, and would disagree at the worst possible moment.
 */

jest.setTimeout(60_000);

/**
 * A date in the RECENT PAST, computed rather than hard-coded.
 *
 * The parser enforces a timestamp sanity band of [2020-01-01, now + 48h] — it is
 * what catches a station with a dead RTC reporting from 1970 or from next year.
 * A fixture dated a week ahead is silently rejected in full, which looks exactly
 * like a broken parser.
 */
const DAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const DAY_KEY_UTC = DAY.toISOString().slice(0, 10);

const CSV = ['timestamp,direction,speed,units,status']
  .concat(
    Array.from(
      { length: 12 },
      (_, i) => `${DAY_KEY_UTC}T09:00:${String(i).padStart(2, '0')}+10:00,${350 - i},0.5${i},K,A`,
    ),
  )
  .join('\r\n') + '\r\n';

/** The LOCAL day those rows fall on, in the fixture organisation's timezone. */
const LOCAL_DAY = DAY_KEY_UTC;

describe('IngestService.dryRunForDevice', () => {
  const service = new IngestService({ emit: () => undefined } as never);
  let orgId: string;
  let deviceId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.create({
      name: `Dry Co ${Date.now()}`, slug: `dry-co-${Date.now()}`,
      contactEmail: 'd@test.invalid', country: 'AU', timezone: 'Australia/Sydney',
    });
    orgId = String(org._id);
    const device = await Device.create({
      organizationId: org._id, name: 'Dry Station', type: 'MET-LINK', bleId: `dry-${Date.now()}`,
    });
    deviceId = String(device._id);
  });

  afterAll(async () => {
    const oid = new Types.ObjectId(orgId);
    await MetMeasure.deleteMany({ organizationId: oid });
    await MetRecord.deleteMany({ organizationId: oid });
    await MetIngestFile.deleteMany({ organizationId: oid });
    await Device.deleteMany({ organizationId: oid });
    await Organization.deleteOne({ _id: oid });
    await mongoose.disconnect();
  });

  it('reports what would be inserted', async () => {
    const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rowsWouldInsert).toBe(12);
    expect(r.sensorsSeen).toEqual(expect.arrayContaining(['wind_speed', 'wind_dir']));
  });

  it('WRITES NOTHING', async () => {
    const before = {
      measures: await MetMeasure.countDocuments({ deviceId: new Types.ObjectId(deviceId) }),
      records: await MetRecord.countDocuments({ deviceId: new Types.ObjectId(deviceId) }),
      files: await MetIngestFile.countDocuments({ deviceId: new Types.ObjectId(deviceId) }),
    };
    await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');

    expect(await MetMeasure.countDocuments({ deviceId: new Types.ObjectId(deviceId) })).toBe(before.measures);
    expect(await MetRecord.countDocuments({ deviceId: new Types.ObjectId(deviceId) })).toBe(before.records);
    // The ledger too — a dry run must not claim the content hash.
    expect(await MetIngestFile.countDocuments({ deviceId: new Types.ObjectId(deviceId) })).toBe(before.files);
  });

  it('is repeatable — the same answer twice', async () => {
    const a = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
    const b = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
    expect(a.ok && b.ok && a.rowsWouldInsert).toBe(b.ok ? b.rowsWouldInsert : -1);
  });

  it('says a day would be CREATED when it does not exist yet', async () => {
    const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
    if (!r.ok) throw new Error('expected ok');
    expect(r.days).toEqual([{ dayKey: LOCAL_DAY, existingMeasures: 0, action: 'create' }]);
  });

  it('groups by LOCAL day, not UTC', async () => {
    // 09:00+10:00 is 23:00 the previous day in UTC. Reporting the UTC day would
    // tell the operator the wrong thing about what their import touches.
    const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
    if (!r.ok) throw new Error('expected ok');
    expect(r.days[0].dayKey).toBe(LOCAL_DAY);
    expect(r.timezone).toBe('Australia/Sydney');
  });

  describe('after the file has actually been imported', () => {
    beforeAll(async () => {
      await service.ingestForDevice(orgId, deviceId, 'real.csv', CSV);
    });

    it('RECOGNISES the same bytes as already ingested', async () => {
      // The double-import, caught before the click.
      const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
      if (!r.ok) throw new Error('expected ok');
      expect(r.duplicateOf).not.toBeNull();
      expect(r.duplicateOf!.rows).toBe(12);
      expect(r.rowsWouldInsert).toBe(0);
    });

    it('still reports what the file CONTAINS, not just that it is a duplicate', async () => {
      const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
      if (!r.ok) throw new Error('expected ok');
      expect(r.rowsParsed).toBe(12);
    });

    it('switches the day from create to APPEND', async () => {
      const r = await service.dryRunForDevice(orgId, deviceId, CSV, 'sample.csv');
      if (!r.ok) throw new Error('expected ok');
      expect(r.days[0]).toMatchObject({ action: 'append', existingMeasures: 12 });
    });

    it('treats a single changed byte as a different file', async () => {
      // Content hash, not filename: renaming a file must not let it in twice,
      // and editing one row must not be mistaken for the original.
      const edited = CSV.replace('350', '351');
      const r = await service.dryRunForDevice(orgId, deviceId, edited, 'sample.csv');
      if (!r.ok) throw new Error('expected ok');
      expect(r.duplicateOf).toBeNull();
      expect(r.rowsWouldInsert).toBe(12);
    });
  });

  describe('refusals', () => {
    it('reports an unreadable file rather than accepting it', async () => {
      const r = await service.dryRunForDevice(orgId, deviceId, 'not a csv', 'bad.csv');
      expect(r.ok).toBe(false);
    });

    it('refuses an unknown device', async () => {
      const r = await service.dryRunForDevice(orgId, String(new Types.ObjectId()), CSV, 'x.csv');
      expect(r).toMatchObject({ ok: false, reason: 'UNKNOWN_DEVICE' });
    });

    it("refuses another customer's device", async () => {
      const other = await Organization.create({
        name: `Dry Other ${Date.now()}`, slug: `dry-other-${Date.now()}`,
        contactEmail: 'o@test.invalid', country: 'AU', timezone: 'UTC',
      });
      try {
        const r = await service.dryRunForDevice(String(other._id), deviceId, CSV, 'x.csv');
        expect(r).toMatchObject({ ok: false, reason: 'UNKNOWN_DEVICE' });
      } finally {
        await Organization.deleteOne({ _id: other._id });
      }
    });
  });
});
