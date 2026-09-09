import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Device } from '../src/models/Device';
import { StationAccount } from '../src/models/StationAccount';
import { User } from '../src/models/User';
import { StreamTypesService } from '../src/provision/stream-types.service';

/**
 * "N stations" must mean every station that actually reads this format.
 *
 * The count grouped on `StationAccount.streamType` alone, which predates
 * per-prefix routing. A station reading wind AND environmental files out of one
 * folder is a real user of both, but only its DEFAULT type was counted — so
 * `environmental-csv` displayed "0 stations" while it was actively ingesting.
 * That reads as "nothing uses this", which is the cue an operator would act on
 * before disabling or deleting a type.
 */
jest.setTimeout(120_000);

describe('stream type station counts (e2e)', () => {
  let app: INestApplication;
  let service: StreamTypesService;
  let orgId: mongoose.Types.ObjectId;
  let deviceId: mongoose.Types.ObjectId;
  const ACCOUNT = `usage-test-${Date.now()}`;

  const countFor = async (key: string) =>
    (await service.list()).find((t) => t.key === key)?.stationCount ?? 0;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(StreamTypesService);

    const user = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = user!.organizationId as mongoose.Types.ObjectId;
    const device = await Device.create({
      organizationId: orgId,
      name: 'USAGE-TEST throwaway station',
      type: 'MET-LINK',
      bleId: `USAGE-TEST-${Date.now()}`,
      isActive: true,
    });
    deviceId = device._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await StationAccount.deleteMany({ account: ACCOUNT });
    await Device.deleteOne({ _id: deviceId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('counts a type reached only through a ROUTE, not just as the default', async () => {
    const before = await countFor('environmental-csv');

    await StationAccount.create({
      account: ACCOUNT,
      folderPath: 'Usage Tower',
      organizationId: orgId,
      deviceId,
      // Default is wind; environmental is reachable only via the route.
      streamType: 'met-csv',
      streamRoutes: [
        { prefix: 'WindSonic_', streamType: 'met-csv' },
        { prefix: 'Environmental_', streamType: 'environmental-csv' },
      ],
      isActive: true,
    });

    // Before the fix this stayed flat: the route was invisible to the count.
    expect(await countFor('environmental-csv')).toBe(before + 1);
  });

  it('counts a station once for a type it uses twice', async () => {
    // `met-csv` is both this station's default AND one of its routes; counting
    // the pair separately would inflate the figure.
    const met = await countFor('met-csv');
    const stations = await StationAccount.countDocuments({
      $or: [{ streamType: 'met-csv' }, { 'streamRoutes.streamType': 'met-csv' }],
    });
    expect(met).toBe(stations);
  });

  it('still counts a station with no routes at all', async () => {
    // Every station registered before routing existed must keep being counted.
    await StationAccount.updateOne({ account: ACCOUNT }, { $set: { streamRoutes: [] } });
    const met = await countFor('met-csv');
    expect(met).toBeGreaterThan(0);
    // And it no longer claims the environmental type it can no longer reach.
    const env = await countFor('environmental-csv');
    const envStations = await StationAccount.countDocuments({
      $or: [{ streamType: 'environmental-csv' }, { 'streamRoutes.streamType': 'environmental-csv' }],
    });
    expect(env).toBe(envStations);
  });
});
