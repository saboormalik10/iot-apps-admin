import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Organization } from '../src/models/Organization';
import { StationAccount } from '../src/models/StationAccount';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';
import { PlatformService } from '../src/platform/platform.service';

/**
 * Deleting a customer must not orphan a live SFTP login.
 *
 * A station is an OS account on the ingest box plus a folder of that customer's
 * files. Remove the customer row while a station is active and the logger keeps
 * uploading into an account whose tenant no longer exists, with ingest accepting
 * files it can attribute to nobody.
 *
 * So this refuses while stations are active rather than cascading. Cascading
 * would make "delete customer" one click that silently tears down SFTP accounts,
 * and the operator would never see which went.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('deleting a customer (e2e)', () => {
  let app: INestApplication;
  let platform: PlatformService;
  let orgId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  const actor = { userId: '', email: `cust-del-${STAMP}@example.invalid` };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    platform = app.get(PlatformService);

    const sup = await User.findOne({ isSuperAdmin: true }).lean();
    actor.userId = String(sup!._id);

    const org = await Organization.create({
      name: `CUSTDEL ${STAMP}`, slug: `custdel-${STAMP}`,
      contactEmail: `custdel-${STAMP}@example.invalid`, country: 'AU', timezone: 'Australia/Sydney',
    });
    orgId = org._id as mongoose.Types.ObjectId;

    const u = await User.create({
      organizationId: orgId, email: `custdel-user-${STAMP}@example.invalid`,
      passwordHash: 'x', firstName: 'C', lastName: 'D', role: 'admin', isActive: true,
    });
    userId = u._id as mongoose.Types.ObjectId;
    await RefreshToken.create({
      userId, tokenHash: `custdel-${STAMP}`, expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null,
    });
  });

  afterAll(async () => {
    await RefreshToken.deleteMany({ userId });
    await User.deleteMany({ organizationId: orgId });
    await StationAccount.deleteMany({ organizationId: orgId });
    await Organization.deleteOne({ _id: orgId });
    await app?.close();
    await mongoose.disconnect();
  });

  it('REFUSES while the customer still has an active station', async () => {
    const sa = await StationAccount.create({
      account: `wx-custdel-${STAMP}`, folderPath: 'Tower', organizationId: orgId,
      deviceId: new mongoose.Types.ObjectId(), streamType: 'met-csv', isActive: true,
    });

    await expect(platform.deleteCustomer(String(orgId), actor)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STATIONS_ACTIVE',
    });

    // …and says how many, so the message is actionable rather than a bare "no".
    await platform.deleteCustomer(String(orgId), actor).catch((e) => {
      expect(e.message).toMatch(/1 active station\b/);
      expect(e.details).toEqual({ activeStations: 1 });
    });

    // Nothing was half-done.
    expect((await Organization.findById(orgId))?.deletedAt).toBeNull();
    expect((await User.findById(userId))?.isActive).toBe(true);

    await StationAccount.deleteOne({ _id: sa._id });
  });

  it('counts only ACTIVE stations — a disabled one does not block', async () => {
    const sa = await StationAccount.create({
      account: `wx-custdel2-${STAMP}`, folderPath: 'Old Tower', organizationId: orgId,
      deviceId: new mongoose.Types.ObjectId(), streamType: 'met-csv', isActive: false,
    });
    // A revoked station's SFTP login is already disabled, so it orphans nothing.
    await expect(platform.deleteCustomer(String(orgId), actor)).resolves.toMatchObject({ name: `CUSTDEL ${STAMP}` });

    await Organization.updateOne({ _id: orgId }, { $set: { deletedAt: null } });
    await User.updateOne({ _id: userId }, { $set: { isActive: true } });
    await RefreshToken.updateMany({ userId }, { $set: { revokedAt: null } });
    await StationAccount.deleteOne({ _id: sa._id });
  });

  it('soft-deletes, deactivates the people and revokes their tokens', async () => {
    const res = await platform.deleteCustomer(String(orgId), actor);
    expect(res.deactivatedUsers).toBe(1);

    expect((await Organization.findById(orgId))?.deletedAt).toBeTruthy();
    expect((await User.findById(userId))?.isActive).toBe(false);
    // Without this a customer admin holds a live refresh token for an
    // organisation that no longer exists.
    expect(await RefreshToken.countDocuments({ userId, revokedAt: null })).toBe(0);
  });

  it('a customer already deleted reads as absent, not as an error to retry', async () => {
    await expect(platform.deleteCustomer(String(orgId), actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses an id that is not an id, rather than throwing a cast error', async () => {
    await expect(platform.deleteCustomer('not-an-id', actor)).rejects.toMatchObject({ statusCode: 404 });
  });
});
