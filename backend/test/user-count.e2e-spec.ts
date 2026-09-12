import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { User } from '../src/models/User';
import { Organization } from '../src/models/Organization';
import { PlatformService } from '../src/platform/platform.service';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { RolesService } from '../src/roles/roles.service';
import { Role } from '../src/models/Role';

/**
 * Removing a user TOMBSTONES the row — `deletedAt` is set and the address is
 * rewritten to `deleted+<id>@…` so it can be re-used — rather than dropping it.
 *
 * The Users page has always filtered those out. The two COUNTS did not, so the
 * platform overview and the organisation switcher both reported people who were
 * gone: one organisation showed "22 users" above a list of 4, which reads as
 * either a broken page or a security problem, and is neither.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('user counts exclude deleted users (e2e)', () => {
  let app: INestApplication;
  let platform: PlatformService;
  let orgs: OrganizationsService;
  let rolesSvc: RolesService;
  let orgId: mongoose.Types.ObjectId;
  let superAdminId: string;
  const madeUsers: mongoose.Types.ObjectId[] = [];

  const countForOrg = async () => {
    const o = await platform.overview();
    return o.rows.find((r) => String(r.organizationId) === String(orgId))?.users;
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    platform = app.get(PlatformService);
    orgs = app.get(OrganizationsService);
    rolesSvc = app.get(RolesService);

    const sup = await User.findOne({ isSuperAdmin: true }).lean();
    superAdminId = String(sup!._id);

    const org = await Organization.create({
      name: `USERCOUNT throwaway ${STAMP}`,
      slug: `usercount-${STAMP}`,
      contactEmail: `usercount-${STAMP}@example.invalid`,
      country: 'AU',
      timezone: 'Australia/Sydney',
    });
    orgId = org._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    if (madeUsers.length) await User.deleteMany({ _id: { $in: madeUsers } });
    await Organization.deleteOne({ _id: orgId });
    await app?.close();
    await mongoose.disconnect();
  });

  const addUser = async (n: number, over: Record<string, unknown> = {}) => {
    const u = await User.create({
      organizationId: orgId,
      email: `usercount-${STAMP}-${n}@example.invalid`,
      passwordHash: 'x',
      firstName: 'U',
      lastName: String(n),
      role: 'viewer',
      isActive: true,
      ...over,
    });
    madeUsers.push(u._id as mongoose.Types.ObjectId);
    return u;
  };

  it('counts only live users on the platform overview', async () => {
    await addUser(1);
    await addUser(2);
    expect(await countForOrg()).toBe(2);

    // Tombstoned exactly as deleteUser leaves it.
    const gone = await addUser(3);
    gone.set({ deletedAt: new Date(), isActive: false, email: `deleted+${String(gone._id)}@example.invalid` });
    await gone.save();

    // This must stay 2. Before the fix it became 3.
    expect(await countForOrg()).toBe(2);
  });

  it('counts only live users in the organisation switcher', async () => {
    const list = await orgs.listAll(superAdminId);
    const row = list.find((o) => String(o._id) === String(orgId));
    expect(row?.userCount).toBe(2);
  });

  it('agrees with the Users page, which is the list people actually see', async () => {
    const page = await orgs.listUsers(String(orgId));
    const rows = (page as { rows?: unknown[] }).rows ?? (page as unknown[]);
    expect(Array.isArray(rows) ? rows.length : 0).toBe(await countForOrg());
  });

  /**
   * The Roles page shows "N people" per role, and that number is the whole basis
   * on which someone decides a role is safe to delete or reassign.
   *
   * A tombstoned user KEEPS its `roleId`, so the count included people who are
   * gone: the shared Viewer role read "20 people" when one live person held it.
   */
  it('counts only live holders of a role', async () => {
    const role = await Role.create({
      organizationId: orgId,
      key: `usercount-role-${STAMP}`,
      name: `USERCOUNT role ${STAMP}`,
      description: 'throwaway',
      permissions: ['data:read'],
      baseRole: 'viewer',
      isSystem: false,
    });

    const live = await addUser(10, { roleId: role._id });
    const gone = await addUser(11, { roleId: role._id });
    gone.set({ deletedAt: new Date(), isActive: false, email: `deleted+${String(gone._id)}@example.invalid` });
    await gone.save();

    const actor = {
      userId: superAdminId,
      email: 'super@observator.com',
      organizationId: String(orgId),
      isSuperAdmin: true,
      perms: [],
    };

    // The list count — 2 before the fix, because the tombstone still points here.
    const listed = (await rolesSvc.list(actor)).find((r) => String(r._id) === String(role._id));
    expect(listed?.userCount).toBe(1);

    // And the delete dialog's own count + sample, which must not name a
    // `deleted+…` address as someone who will be reassigned.
    const usage = await rolesSvc.usage(String(role._id), actor);
    expect(usage.userCount).toBe(1);
    expect(usage.users.map((u) => u.email)).toEqual([live.email]);

    await Role.deleteOne({ _id: role._id });
  });
});
