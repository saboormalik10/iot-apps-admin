import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { PlatformService } from '../src/platform/platform.service';

/**
 * "Root organisation" is not a concept in this schema. An organisation is the
 * platform administrator's home because their own user row points at it — so
 * moving home is repointing that row, and nothing else.
 *
 * The thing worth pinning is what it must NOT do: confer access. Home decides
 * where somebody lands, not what they may see. `isSuperAdmin` is separate.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('moving the platform administrator’s home (e2e)', () => {
  let app: INestApplication;
  let platform: PlatformService;
  let supId: string;
  let originalHome: mongoose.Types.ObjectId;
  let otherOrg: mongoose.Types.ObjectId;
  const actor = { userId: '', email: `sethome-${STAMP}@example.invalid` };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    platform = app.get(PlatformService);

    const sup = await User.findOne({ isSuperAdmin: true });
    supId = String(sup!._id);
    actor.userId = supId;
    originalHome = sup!.organizationId as mongoose.Types.ObjectId;

    const o = await Organization.create({
      name: `SETHOME ${STAMP}`, slug: `sethome-${STAMP}`,
      contactEmail: `sethome-${STAMP}@example.invalid`, country: 'AU', timezone: 'Australia/Sydney',
    });
    otherOrg = o._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    // Put the administrator back where they were — this test moves a real user.
    await User.updateOne({ _id: supId }, { $set: { organizationId: originalHome } });
    await Organization.deleteOne({ _id: otherOrg });
    await app?.close();
    await mongoose.disconnect();
  });

  it('repoints the caller’s own organisation', async () => {
    const res = await platform.setHomeOrganization(String(otherOrg), actor);
    expect(res.changed).toBe(true);
    expect(String((await User.findById(supId))!.organizationId)).toBe(String(otherOrg));
  });

  it('does not grant anything — isSuperAdmin is untouched', async () => {
    const u = await User.findById(supId).lean();
    expect(u?.isSuperAdmin).toBe(true);
    // And the customer gained no standing by being somebody's home.
    const org = await Organization.findById(otherOrg).lean();
    expect(org).toBeTruthy();
  });

  it('is idempotent — setting the current home reports no change', async () => {
    const res = await platform.setHomeOrganization(String(otherOrg), actor);
    expect(res.changed).toBe(false);
  });

  it('refuses a customer that does not exist', async () => {
    await expect(
      platform.setHomeOrganization(new mongoose.Types.ObjectId().toString(), actor),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(platform.setHomeOrganization('not-an-id', actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a DELETED customer', async () => {
    await Organization.updateOne({ _id: otherOrg }, { $set: { deletedAt: new Date() } });
    await expect(platform.setHomeOrganization(String(otherOrg), actor)).rejects.toMatchObject({ statusCode: 404 });
    await Organization.updateOne({ _id: otherOrg }, { $set: { deletedAt: null } });
  });

  it('refuses a caller who is not a platform administrator', async () => {
    const plain = await User.findOne({ email: 'viewer@observator.com' }).lean();
    await expect(
      platform.setHomeOrganization(String(otherOrg), { userId: String(plain!._id), email: 'v@x' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('re-reads super-admin status from the DATABASE, not the caller’s word', async () => {
    // The actor object is caller-supplied; a demoted administrator must not keep
    // moving homes because their token still says otherwise.
    await User.updateOne({ _id: supId }, { $set: { isSuperAdmin: false } });
    await expect(platform.setHomeOrganization(String(originalHome), actor)).rejects.toMatchObject({
      statusCode: 403,
    });
    await User.updateOne({ _id: supId }, { $set: { isSuperAdmin: true } });
  });
});
