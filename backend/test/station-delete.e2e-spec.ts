import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { StationAccount } from '../src/models/StationAccount';
import { ProvisioningJob } from '../src/models/ProvisioningJob';
import { MetRecord } from '../src/models/MetRecord';
import { MetMeasure } from '../src/models/MetMeasure';
import { User } from '../src/models/User';
import { DevicesService } from '../src/devices/devices.service';

/**
 * Deleting a station used to set `deletedAt` on the device and nothing else.
 * The station vanished from the portal while its SFTP account stayed live, the
 * logger kept uploading, and ingest kept accepting the files — because routing
 * is by STATION ACCOUNT and never looked at the device.
 *
 * The dangerous half of the fix is the shared account. One SFTP login can serve
 * several stations (`wx-final-customer` serves two different devices today), so
 * disabling the login on the strength of one deletion would silently cut the
 * others off.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('deleting a station (e2e)', () => {
  let app: INestApplication;
  let devices: DevicesService;
  let orgId: mongoose.Types.ObjectId;
  const ACCOUNT = `wx-deltest-${STAMP}`;
  const made: mongoose.Types.ObjectId[] = [];
  const actor = { userId: '', email: `deltest-${STAMP}@example.invalid` };

  const mkDevice = async (name: string) => {
    const d = await Device.create({
      organizationId: orgId, name, type: 'MET-LINK',
      bleId: `DELTEST-${name}-${STAMP}`, isActive: true,
    });
    made.push(d._id as mongoose.Types.ObjectId);
    return d;
  };

  const mkMapping = async (deviceId: mongoose.Types.ObjectId, folderPath: string) =>
    StationAccount.create({
      account: ACCOUNT, folderPath, organizationId: orgId, deviceId,
      streamType: 'met-csv', isActive: true,
    });

  const disableJobs = () =>
    ProvisioningJob.countDocuments({ type: 'disableStationAccount', 'args.account': ACCOUNT });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    devices = app.get(DevicesService);

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = admin!.organizationId as mongoose.Types.ObjectId;
    actor.userId = String(admin!._id);
  });

  afterAll(async () => {
    await StationAccount.deleteMany({ account: ACCOUNT });
    await ProvisioningJob.deleteMany({ 'args.account': ACCOUNT });
    await MetRecord.deleteMany({ deviceId: { $in: made } });
    await Device.deleteMany({ _id: { $in: made } });
    await app?.close();
    await mongoose.disconnect();
  });

  it('does NOT disable a shared SFTP login while another station still uses it', async () => {
    const a = await mkDevice('shared-a');
    const b = await mkDevice('shared-b');
    await mkMapping(a._id as mongoose.Types.ObjectId, `folder-a-${STAMP}`);
    await mkMapping(b._id as mongoose.Types.ObjectId, `folder-b-${STAMP}`);

    await devices.deleteDevice(String(orgId), String(a._id), actor);

    // A's mapping is off; B's is untouched; the login stays usable for B.
    expect(await StationAccount.countDocuments({ deviceId: a._id, isActive: true })).toBe(0);
    expect(await StationAccount.countDocuments({ deviceId: b._id, isActive: true })).toBe(1);
    expect(await disableJobs()).toBe(0);
  });

  it('disables the SFTP login once the LAST station using it is deleted', async () => {
    const b = await Device.findOne({ bleId: `DELTEST-shared-b-${STAMP}` });
    await devices.deleteDevice(String(orgId), String(b!._id), actor);

    expect(await StationAccount.countDocuments({ account: ACCOUNT, isActive: true })).toBe(0);
    expect(await disableJobs()).toBe(1);
  });

  it('queues a DISABLE, never a delete — files on the box are not touched', async () => {
    const job = await ProvisioningJob.findOne({ 'args.account': ACCOUNT }).lean();
    expect(job?.type).toBe('disableStationAccount');
    // The agent has no delete job at all; asserting the type here is what stops
    // a future change quietly swapping in something destructive.
    expect(JSON.stringify(job?.args)).not.toMatch(/delete|remove|rm\b/i);
  });

  it('deletes the station’s readings', async () => {
    const d = await mkDevice('with-readings');
    const rec = await MetRecord.create({
      organizationId: orgId, deviceId: d._id, deviceName: d.name,
      dayKey: '2026-01-01', dateStart: '2026-01-01 00:00:00',
      dateStartMs: Date.UTC(2026, 0, 1), dateEndMs: Date.UTC(2026, 0, 1, 23),
      measureCount: 2, source: 'sftp',
    });
    await MetMeasure.insertMany([
      { organizationId: orgId, recordId: rec._id, rowType: 'data', dataSentence: 'x',
        timeStamp: 'x', timestampMs: Date.UTC(2026, 0, 1, 1), source: 'sftp' },
      { organizationId: orgId, recordId: rec._id, rowType: 'data', dataSentence: 'y',
        timeStamp: 'y', timestampMs: Date.UTC(2026, 0, 1, 2), source: 'sftp' },
    ]);
    expect(await MetMeasure.countDocuments({ recordId: rec._id })).toBe(2);

    await devices.deleteDevice(String(orgId), String(d._id), actor);

    expect(await MetMeasure.countDocuments({ recordId: rec._id })).toBe(0);
    expect(await MetRecord.countDocuments({ deviceId: d._id })).toBe(0);
    expect((await Device.findById(d._id))?.deletedAt).toBeTruthy();
  });
});
