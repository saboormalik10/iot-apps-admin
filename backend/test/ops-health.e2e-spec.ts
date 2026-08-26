import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { OpsHealthService } from '../src/platform/ops-health.service';
import { Device } from '../src/models/Device';
import { StationAccount } from '../src/models/StationAccount';
import { MetRecord } from '../src/models/MetRecord';
import { Organization } from '../src/models/Organization';

/**
 * Operational health (M23 W3).
 *
 * Every check here exists for a failure that raises NOTHING: a station that has
 * stopped (indistinguishable from calm weather, and from a full disk on the
 * ingest box), a TTL that has stopped deleting, a rollup that has stopped
 * advancing. The tests are about whether each check actually notices.
 */

jest.setTimeout(60_000);

describe('OpsHealthService', () => {
  const service = new OpsHealthService();
  let orgId: Types.ObjectId;
  const made: Types.ObjectId[] = [];

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.create({
      name: `Ops Co ${Date.now()}`, slug: `ops-co-${Date.now()}`,
      contactEmail: 'o@test.invalid', country: 'AU', timezone: 'UTC',
    });
    orgId = org._id as Types.ObjectId;
    made.push(orgId);
  });

  afterAll(async () => {
    await StationAccount.deleteMany({ organizationId: orgId });
    await Device.deleteMany({ organizationId: orgId });
    await MetRecord.deleteMany({ organizationId: orgId });
    await Organization.deleteMany({ _id: { $in: made } });
    await mongoose.disconnect();
  });

  const get = async (key: string) => (await service.check()).checks.find((c) => c.key === key)!;

  it('reports every check, with an overall status', async () => {
    const r = await service.check();
    expect(r.checks.map((c) => c.key)).toEqual(
      expect.arrayContaining(['database', 'silentStations', 'ingestErrors', 'retention', 'dayRecordLag', 'pendingProvisioning']),
    );
    expect(['ok', 'warn', 'fail']).toContain(r.status);
  });

  it('takes the WORST status, never an average', async () => {
    // One failing check must not be diluted by five healthy ones.
    const r = await service.check();
    const worst = r.checks.some((c) => c.status === 'fail') ? 'fail' : r.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
    expect(r.status).toBe(worst);
  });

  it('gives an ACTION for anything not ok — a check nobody can act on is noise', async () => {
    const r = await service.check();
    for (const c of r.checks) {
      if (c.status !== 'ok') expect([c.key, Boolean(c.action)]).toEqual([c.key, true]);
    }
  });

  it('names the full-disk case, because it is indistinguishable from a quiet station', async () => {
    const c = await get('silentStations');
    if (c.status !== 'ok') expect(c.action).toMatch(/disk/i);
  });

  it('confirms the TTL index exists — its absence is invisible otherwise', async () => {
    const c = await get('retention');
    expect(c.status).not.toBe('fail');
    expect(c.summary).toMatch(/TTL|retained/i);
  });

  describe('a station that has stopped reporting', () => {
    let deviceId: Types.ObjectId;

    beforeAll(async () => {
      const device = await Device.create({
        organizationId: orgId, name: 'Ops silent', type: 'MET-LINK', bleId: `ops-${Date.now()}`,
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      deviceId = device._id as Types.ObjectId;
      await StationAccount.create({
        account: `ops${Date.now().toString(36)}`, folderPath: `Ops/${Date.now()}`,
        organizationId: orgId, deviceId, streamType: 'met-csv', isActive: true,
      });
    });

    it('is reported as silent', async () => {
      const c = await get('silentStations');
      expect(c.status).toBe('warn');
      expect(JSON.stringify(c.detail)).toContain('Ops silent');
    });

    it('is NOT reported once the mapping is revoked', async () => {
      // A revoked station is silent on purpose. Alerting on it would train
      // people to ignore this check.
      await StationAccount.updateMany({ deviceId }, { $set: { isActive: false } });
      const c = await get('silentStations');
      expect(JSON.stringify(c.detail)).not.toContain('Ops silent');
      await StationAccount.updateMany({ deviceId }, { $set: { isActive: true } });
    });

    it('does not count a station that has NEVER reported as silent', async () => {
      // That is pending provisioning, not a failure.
      const fresh = await Device.create({
        organizationId: orgId, name: 'Ops never', type: 'MET-LINK', bleId: `never-${Date.now()}`,
      });
      await StationAccount.create({
        account: `nev${Date.now().toString(36)}`, folderPath: `Ops/never-${Date.now()}`,
        organizationId: orgId, deviceId: fresh._id, streamType: 'met-csv', isActive: true,
      });
      const c = await get('silentStations');
      expect(JSON.stringify(c.detail)).not.toContain('Ops never');
      expect((c.detail as { neverReported: number }).neverReported).toBeGreaterThanOrEqual(1);
    });
  });

  describe('a station clock running ahead', () => {
    it('FLAGS a future-dated reading instead of reporting a negative age', async () => {
      // The parser's sanity band tolerates up to 48h ahead, so these are stored.
      // The danger is that `getMetLatest` then pins to a future reading and looks
      // stuck until real time catches up — and "-193 minutes old" hides it.
      const device = await Device.create({
        organizationId: orgId, name: 'Ops future', type: 'MET-LINK', bleId: `fut-${Date.now()}`,
      });
      const ahead = Date.now() + 3 * 60 * 60 * 1000;
      await MetRecord.create({
        organizationId: orgId, deviceId: device._id, deviceName: 'Ops future',
        dateStart: new Date(ahead).toISOString(), dateStartMs: ahead, dateEndMs: ahead,
        measureCount: 1, source: 'sftp', dayKey: 'future-day',
      });

      const c = await get('dayRecordLag');
      expect(c.status).toBe('warn');
      expect(c.summary).toMatch(/future/i);
      expect(c.action).toMatch(/RTC|clock/i);
    });
  });
});
