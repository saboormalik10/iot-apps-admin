import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { StationAccount } from '../src/models/StationAccount';
import { ProvisioningJob } from '../src/models/ProvisioningJob';
import { User } from '../src/models/User';
import { StationsService } from '../src/provision/stations.service';

/**
 * Restoring a revoked station has to actually restore it.
 *
 * `disableStationAccount` runs `usermod --lock --expiredate 1`: it locks the
 * password AND expires the account. Restoring only rotated the password, which
 * replaces the hash and so clears the lock — but nothing cleared the expiry, so
 * every login was still refused. The portal reported the station restored and
 * handed over a fresh password that could not be used.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('restoring a revoked station (e2e)', () => {
  let app: INestApplication;
  let stations: StationsService;
  let orgId: mongoose.Types.ObjectId;
  let mappingId: string;
  let deviceId: mongoose.Types.ObjectId;
  const ACCOUNT = `wx-restore-${STAMP}`;
  const actor = { userId: '', email: `restore-${STAMP}@example.invalid` };

  const jobsFor = () =>
    ProvisioningJob.find({ 'args.account': ACCOUNT }).sort({ createdAt: 1 }).lean();

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    stations = app.get(StationsService);

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = admin!.organizationId as mongoose.Types.ObjectId;
    actor.userId = String(admin!._id);

    const d = await Device.create({
      organizationId: orgId, name: `RESTORE ${STAMP}`, type: 'MET-LINK',
      bleId: `RESTORE-${STAMP}`, isActive: true,
    });
    deviceId = d._id as mongoose.Types.ObjectId;
    const mapping = await StationAccount.create({
      account: ACCOUNT, folderPath: `restore-${STAMP}`, organizationId: orgId,
      deviceId, streamType: 'met-csv', isActive: true,
    });
    mappingId = String(mapping._id);
  });

  afterAll(async () => {
    await ProvisioningJob.deleteMany({ 'args.account': ACCOUNT });
    await StationAccount.deleteMany({ account: ACCOUNT });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('revoking queues a disable', async () => {
    await stations.revokeStation(mappingId, actor);
    const jobs = await jobsFor();
    expect(jobs.map((j) => j.type)).toEqual(['disableStationAccount']);
    expect(await StationAccount.findById(mappingId).lean().then((m) => m?.isActive)).toBe(false);
  });

  it('restoring queues an ENABLE before the password rotation', async () => {
    await stations.restoreStation(mappingId, actor);
    const types = (await jobsFor()).map((j) => j.type);

    // Order matters and is checked, not assumed: the queue hands out the oldest
    // job first (`sort: { createdAt: 1 }`), so enable must be queued first or the
    // password is set on an account that is still expired.
    expect(types).toEqual(['disableStationAccount', 'enableStationAccount', 'rotateStationPassword']);
  });

  it('the enable job names the account, so the agent can act on it', async () => {
    const enable = (await jobsFor()).find((j) => j.type === 'enableStationAccount');
    expect(enable?.args?.account).toBe(ACCOUNT);
    expect(enable?.status).toBe('queued');
  });

  it('a plain password rotation does NOT enable anything', async () => {
    await ProvisioningJob.deleteMany({ 'args.account': ACCOUNT });
    await stations.rotatePassword(mappingId, actor);
    const types = (await jobsFor()).map((j) => j.type);
    expect(types).toEqual(['rotateStationPassword']);
    expect(types).not.toContain('enableStationAccount');
  });
});
