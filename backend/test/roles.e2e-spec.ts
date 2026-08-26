import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { RolesService, RoleActor } from '../src/roles/roles.service';
import { RoleInputDto, RoleUpdateDto } from '../src/roles/dto';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';

/**
 * Role CRUD (M18 W3).
 *
 * The service is exercised directly rather than over HTTP — the guards have their
 * own spec, and this keeps the tenancy rules (which are the part that would leak
 * one customer's structure to another) readable.
 */

jest.setTimeout(60_000);

const ORG_A = new Types.ObjectId();
const ORG_B = new Types.ObjectId();
const USER_ID = new Types.ObjectId();

const actor = (over: Partial<RoleActor> = {}): RoleActor => ({
  userId: String(USER_ID),
  email: 'tester@observator.com',
  organizationId: String(ORG_A),
  isSuperAdmin: false,
  ...over,
});

const superActor = () => actor({ isSuperAdmin: true });

describe('RolesService', () => {
  const service = new RolesService();
  const made: Types.ObjectId[] = [];

  const track = async <T extends { _id: unknown }>(p: Promise<T>): Promise<T> => {
    const r = await p;
    made.push(r._id as Types.ObjectId);
    return r;
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });

  afterAll(async () => {
    if (made.length) await Role.deleteMany({ _id: { $in: made } });
    await mongoose.disconnect();
  });

  describe('create', () => {
    it('drops a permission that does not exist rather than storing it', async () => {
      const role = await track(
        service.create({ name: `T Drop ${Date.now()}`, permissions: ['data:read', 'made:up'] }, actor()),
      );
      expect(role.permissions).toEqual(['data:read']);
    });

    it('stores grants sorted, so two equal sets compare equal', async () => {
      const role = await track(
        service.create({ name: `T Sort ${Date.now()}`, permissions: ['user:write', 'data:read'] }, actor()),
      );
      expect(role.permissions).toEqual(['data:read', 'user:write']);
    });

    it('refuses a role that grants nothing', async () => {
      await expect(service.create({ name: 'T Empty', permissions: [] }, actor())).rejects.toMatchObject({
        statusCode: 400,
      });
      // ...including one whose every grant was invalid, which is the same thing.
      await expect(service.create({ name: 'T Bogus', permissions: ['nope:nope'] }, actor())).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('refuses a blank name', async () => {
      await expect(service.create({ name: '   ', permissions: ['data:read'] }, actor())).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('derives a stable machine key from the name', async () => {
      const role = await track(service.create({ name: 'Site  Supervisor!', permissions: ['data:read'] }, actor()));
      expect(role.key).toBe('site-supervisor');
    });

    it('gives a super admin a SHARED role and everyone else an org-owned one', async () => {
      const shared = await track(service.create({ name: `T Shared ${Date.now()}`, permissions: ['data:read'] }, superActor()));
      const owned = await track(service.create({ name: `T Owned ${Date.now()}`, permissions: ['data:read'] }, actor()));
      // A customer creating a role must not create one every other customer sees.
      expect(shared.organizationId).toBeNull();
      expect(String(owned.organizationId)).toBe(String(ORG_A));
    });

    it('refuses a duplicate name within the same organisation', async () => {
      const name = `T Dupe ${Date.now()}`;
      await track(service.create({ name, permissions: ['data:read'] }, actor()));
      await expect(service.create({ name, permissions: ['data:read'] }, actor())).rejects.toMatchObject({
        code: 'DUPLICATE_ROLE',
      });
    });

    it('allows the same name in a DIFFERENT organisation', async () => {
      const name = `T Shared Name ${Date.now()}`;
      await track(service.create({ name, permissions: ['data:read'] }, actor()));
      const other = await track(service.create({ name, permissions: ['data:read'] }, actor({ organizationId: String(ORG_B) })));
      expect(String(other.organizationId)).toBe(String(ORG_B));
    });
  });

  describe('update', () => {
    it('never changes the machine key on rename', async () => {
      // The JWT and the legacy RolesGuard both read `key`; changing it would
      // silently alter what a guard allows.
      const role = await track(service.create({ name: `T Key ${Date.now()}`, permissions: ['data:read'] }, actor()));
      const updated = await service.update(String(role._id), { name: 'Completely Different' }, actor());
      expect(updated!.key).toBe(role.key);
      expect(updated!.name).toBe('Completely Different');
    });

    it('leaves untouched fields alone on a partial update', async () => {
      const role = await track(
        service.create({ name: `T Partial ${Date.now()}`, description: 'keep me', permissions: ['data:read'] }, actor()),
      );
      const updated = await service.update(String(role._id), { permissions: ['alert:read'] }, actor());
      expect(updated!.description).toBe('keep me');
      expect(updated!.name).toBe(role.name);
      expect(updated!.permissions).toEqual(['alert:read']);
    });

    it('refuses to leave a role granting nothing', async () => {
      const role = await track(service.create({ name: `T Strip ${Date.now()}`, permissions: ['data:read'] }, actor()));
      await expect(service.update(String(role._id), { permissions: [] }, actor())).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('lets only a platform administrator edit a shared system role', async () => {
      const role = await track(service.create({ name: `T Sys ${Date.now()}`, permissions: ['data:read'] }, superActor()));
      await Role.updateOne({ _id: role._id }, { $set: { isSystem: true } });

      await expect(service.update(String(role._id), { name: 'Hijacked' }, actor())).rejects.toMatchObject({
        statusCode: 403,
      });
      const ok = await service.update(String(role._id), { name: 'Renamed by super' }, superActor());
      expect(ok!.name).toBe('Renamed by super');
    });
  });

  describe('tenancy', () => {
    it("reports another organisation's role as ABSENT, not forbidden", async () => {
      // 404 rather than 403 deliberately: a 403 would confirm the role exists and
      // let one customer enumerate another's structure.
      const other = await track(
        service.create({ name: `T Other ${Date.now()}`, permissions: ['data:read'] }, actor({ organizationId: String(ORG_B) })),
      );
      await expect(service.usage(String(other._id), actor())).rejects.toMatchObject({ statusCode: 404 });
    });

    it('404s a malformed id instead of throwing a cast error', async () => {
      await expect(service.usage('not-an-objectid', actor())).rejects.toMatchObject({ statusCode: 404 });
    });

    it('hides a soft-deleted role', async () => {
      const role = await track(service.create({ name: `T Gone ${Date.now()}`, permissions: ['data:read'] }, actor()));
      await Role.updateOne({ _id: role._id }, { $set: { deletedAt: new Date() } });
      await expect(service.usage(String(role._id), actor())).rejects.toMatchObject({ statusCode: 404 });
    });

    it('shows a customer the shared roles plus its own, and no one else’s', async () => {
      const mine = await track(service.create({ name: `T Mine ${Date.now()}`, permissions: ['data:read'] }, actor()));
      const theirs = await track(
        service.create({ name: `T Theirs ${Date.now()}`, permissions: ['data:read'] }, actor({ organizationId: String(ORG_B) })),
      );
      const ids = (await service.list(actor())).map((r) => String(r._id));
      expect(ids).toContain(String(mine._id));
      expect(ids).not.toContain(String(theirs._id));
    });
  });

  describe('usage counts', () => {
    it('counts the users holding each role', async () => {
      // Counted against the real `viewer` system role, and the fixture user is
      // given the MATCHING legacy key. permissions.e2e-spec asserts globally that
      // every user's roleId resolves to their `role`; a fixture pointing at a
      // throwaway role broke that invariant for other suites running in parallel.
      const viewer = await Role.findOne({ key: 'viewer', organizationId: null, deletedAt: null }).lean();
      if (!viewer) return;

      const before = await service.usage(String(viewer._id), superActor());

      const throwaway = await User.create({
        organizationId: ORG_A,
        email: `role-count-${Date.now()}@test.invalid`,
        passwordHash: 'x'.repeat(60),
        firstName: 'Count',
        lastName: 'Fixture',
        role: 'viewer',
        roleId: viewer._id,
      });

      try {
        expect((await service.usage(String(viewer._id), superActor())).userCount).toBe(before.userCount + 1);
        const listed = (await service.list(superActor())).find((r) => String(r._id) === String(viewer._id));
        expect(listed!.userCount).toBe(before.userCount + 1);
      } finally {
        await User.deleteOne({ _id: throwaway._id });
      }
    });

    it('reports zero for a role nobody holds', async () => {
      const role = await track(service.create({ name: `T Zero ${Date.now()}`, permissions: ['data:read'] }, actor()));
      const listed = (await service.list(actor())).find((r) => String(r._id) === String(role._id));
      expect(listed!.userCount).toBe(0);
    });
  });
});

describe('deletion with reassignment', () => {
  const service = new RolesService();
  const ORG = new Types.ObjectId();
  // Each lockout case needs a PRISTINE organisation: the guard asks "does anyone
  // else here still hold user:write", so a holder left behind by an earlier test
  // in a shared org makes the lockout correctly not fire.
  const orgs: Types.ObjectId[] = [ORG];
  const freshOrg = () => {
    const o = new Types.ObjectId();
    orgs.push(o);
    return o;
  };
  const cleanup: Types.ObjectId[] = [];

  const mkRole = async (name: string, permissions: string[], org: Types.ObjectId = ORG) => {
    const r = await Role.create({ organizationId: org, key: `${name}-${Date.now()}`, name, permissions });
    cleanup.push(r._id as Types.ObjectId);
    return r;
  };
  const mkUser = async (role: string, roleId: Types.ObjectId, org: Types.ObjectId = ORG) =>
    User.create({
      organizationId: org,
      email: `w4-${Math.random().toString(36).slice(2)}@test.invalid`,
      passwordHash: 'x'.repeat(60),
      firstName: 'W4',
      lastName: 'Fixture',
      role,
      roleId,
    });

  const orgActor = (org: Types.ObjectId = ORG): RoleActor =>
    actor({ organizationId: String(org), isSuperAdmin: true });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });
  afterAll(async () => {
    await User.deleteMany({ organizationId: { $in: orgs } });
    await Role.deleteMany({ organizationId: { $in: orgs } });
    await mongoose.disconnect();
  });

  it('deletes an unused role without asking for a replacement', async () => {
    const role = await mkRole('W4 Unused', ['data:read']);
    const res = await service.remove(String(role._id), orgActor());
    expect(res.usersMoved).toBe(0);
    expect((await Role.findById(role._id).lean())?.deletedAt).toBeTruthy();
  });

  it('soft-deletes, freeing the key while keeping the document', async () => {
    // The audit trail still resolves the role, and the partial unique index lets
    // the key be reused — a hard delete would break the first and a plain unique
    // index would prevent the second.
    const role = await mkRole('W4 Soft', ['data:read']);
    await service.remove(String(role._id), orgActor());
    const doc = await Role.findById(role._id).lean();
    expect(doc).not.toBeNull();
    expect(doc!.deletedAt).toBeTruthy();
  });

  it('refuses to delete a role people hold, and says how many', async () => {
    const role = await mkRole('W4 Held', ['data:read']);
    await mkUser('operator', role._id as Types.ObjectId);
    await mkUser('operator', role._id as Types.ObjectId);

    await expect(service.remove(String(role._id), orgActor())).rejects.toMatchObject({
      statusCode: 409,
      code: 'ROLE_IN_USE',
      details: { userCount: 2 },
    });
    expect((await Role.findById(role._id).lean())?.deletedAt).toBeNull();
  });

  it('moves every holder to the replacement, updating roleId AND the legacy key', async () => {
    // Both must move together: `role` is what the JWT and RolesGuard read, so
    // updating one without the other changes what a guard allows.
    const doomed = await mkRole('W4 Doomed', ['data:read', 'user:write']);
    const target = await mkRole('W4 Target', ['data:read', 'user:write']);
    await mkUser('operator', doomed._id as Types.ObjectId);
    await mkUser('viewer', doomed._id as Types.ObjectId);

    const res = await service.remove(String(doomed._id), orgActor(), String(target._id));
    expect(res.usersMoved).toBe(2);

    const moved = await User.find({ organizationId: ORG, roleId: target._id }).select('role').lean();
    expect(moved).toHaveLength(2);
    expect(moved.every((u) => u.role === target.key)).toBe(true);
    expect(await User.countDocuments({ roleId: doomed._id })).toBe(0);
  });

  it('refuses a replacement that is the role being deleted', async () => {
    const role = await mkRole('W4 Self', ['data:read']);
    await mkUser('operator', role._id as Types.ObjectId);
    await expect(service.remove(String(role._id), orgActor(), String(role._id))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('refuses a replacement from another organisation', async () => {
    const role = await mkRole('W4 Cross', ['data:read']);
    await mkUser('operator', role._id as Types.ObjectId);
    const foreign = await Role.create({
      organizationId: new Types.ObjectId(),
      key: `w4-foreign-${Date.now()}`,
      name: 'Foreign',
      permissions: ['data:read'],
    });
    cleanup.push(foreign._id as Types.ObjectId);

    await expect(
      service.remove(String(role._id), actor({ organizationId: String(ORG) }), String(foreign._id)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await Role.deleteOne({ _id: foreign._id });
  });

  it('refuses a replacement that would leave nobody able to manage users', async () => {
    const org = freshOrg();
    const only = await mkRole('W4 OnlyAdmin', ['data:read', 'user:write'], org);
    const readOnly = await mkRole('W4 ReadOnly', ['data:read'], org);
    await mkUser('admin', only._id as Types.ObjectId, org);

    await expect(service.remove(String(only._id), orgActor(org), String(readOnly._id))).rejects.toMatchObject({
      statusCode: 409,
      code: 'WOULD_LOCK_OUT',
    });
    // Nothing moved, and the role survives.
    expect(await User.countDocuments({ roleId: only._id })).toBe(1);
    expect((await Role.findById(only._id).lean())?.deletedAt).toBeNull();
  });

  it('allows it once somebody else can still manage users', async () => {
    const org = freshOrg();
    const going = await mkRole('W4 Going', ['data:read', 'user:write'], org);
    const readOnly = await mkRole('W4 RO2', ['data:read'], org);
    const keeper = await mkRole('W4 Keeper', ['data:read', 'user:write'], org);
    await mkUser('operator', going._id as Types.ObjectId, org);
    await mkUser('admin', keeper._id as Types.ObjectId, org);

    const res = await service.remove(String(going._id), orgActor(org), String(readOnly._id));
    expect(res.usersMoved).toBe(1);
  });

  it('lists candidate replacements in the usage preflight, excluding itself', async () => {
    // One call powers the whole dialog: the count and the dropdown.
    const role = await mkRole('W4 Preflight', ['data:read']);
    await mkUser('operator', role._id as Types.ObjectId);

    const usage = await service.usage(String(role._id), orgActor());
    expect(usage.userCount).toBe(1);
    expect(usage.replacements.length).toBeGreaterThan(0);
    expect(usage.replacements.map((r) => r._id)).not.toContain(String(role._id));
  });
});

describe('role DTOs', () => {
  const errorsFor = async (cls: typeof RoleInputDto | typeof RoleUpdateDto, body: unknown) =>
    (await validate(plainToInstance(cls, body as object))).map((e) => e.property);

  it('requires name and permissions on create', async () => {
    expect(await errorsFor(RoleInputDto, {})).toEqual(expect.arrayContaining(['name', 'permissions']));
  });

  it('accepts a permissions-only update', async () => {
    // This is the regression: PATCH reused the create DTO, so changing only the
    // permissions failed on a missing `name` — a request the service handles.
    expect(await errorsFor(RoleUpdateDto, { permissions: ['data:read'] })).toEqual([]);
  });

  it('accepts a name-only update, and an empty body', async () => {
    expect(await errorsFor(RoleUpdateDto, { name: 'Renamed' })).toEqual([]);
    expect(await errorsFor(RoleUpdateDto, {})).toEqual([]);
  });

  it('still enforces the name length and permission types on update', async () => {
    expect(await errorsFor(RoleUpdateDto, { name: 'x'.repeat(61) })).toEqual(['name']);
    expect(await errorsFor(RoleUpdateDto, { permissions: [1, 2] })).toEqual(['permissions']);
  });
});
