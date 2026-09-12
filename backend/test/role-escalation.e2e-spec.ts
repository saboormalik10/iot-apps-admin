import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';
import { RolesService, type RoleActor } from '../src/roles/roles.service';

/**
 * "You may delegate your authority; you may not manufacture it."
 *
 * `resolve-role.ts` enforced that rule on role ASSIGNMENT — pointing a user at a
 * role carrying grants the assigner lacks is refused. Editing the role itself
 * reached the same place by a different road and was NOT checked:
 *
 *   1. hold `role:write` (only a platform administrator can grant it — the
 *      seeded Organisation Admin has `role:read` only)
 *   2. add `user:write` to the role you already hold
 *   3. refresh the token — you now hold it
 *
 * Assignment never happened, so the assignment-time check never ran.
 *
 * The fix applies the same rule to the permissions a create or update ADDS.
 * Additions only, deliberately: a role built by a platform administrator can
 * legitimately carry a grant the customer admin editing its NAME does not hold,
 * and the editor resubmits the whole list on every save.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('role writes cannot manufacture permissions (e2e)', () => {
  let app: INestApplication;
  let service: RolesService;
  let orgId: string;
  const created: mongoose.Types.ObjectId[] = [];

  /** An actor holding exactly `perms` — never a super admin. */
  const actor = (perms: string[]): RoleActor => ({
    userId: new mongoose.Types.ObjectId().toString(),
    email: `escalation-${STAMP}@example.invalid`,
    organizationId: orgId,
    isSuperAdmin: false,
    perms,
  });

  const track = async <T extends { _id: unknown }>(p: Promise<T>): Promise<T> => {
    const r = await p;
    created.push(r._id as mongoose.Types.ObjectId);
    return r;
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(RolesService);

    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = String(admin!.organizationId);
  });

  afterAll(async () => {
    if (created.length) await Role.deleteMany({ _id: { $in: created } });
    await Role.deleteMany({ name: { $regex: `^ESCALATION-${STAMP}` } });
    await app?.close();
    await mongoose.disconnect();
  });

  it('refuses to CREATE a role carrying a permission the author does not hold', async () => {
    await expect(
      service.create(
        { name: `ESCALATION-${STAMP} create`, permissions: ['data:read', 'user:write'] },
        actor(['role:write', 'data:read']),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_GRANT' });
  });

  it('allows creating a role within the author’s own grants', async () => {
    const role = await track(
      service.create(
        { name: `ESCALATION-${STAMP} ok`, permissions: ['data:read'] },
        actor(['role:write', 'data:read']),
      ) as Promise<{ _id: unknown }>,
    );
    expect(role).toBeTruthy();
  });

  it('refuses to ADD a permission the author does not hold to an existing role', async () => {
    const role = await track(
      service.create(
        { name: `ESCALATION-${STAMP} target`, permissions: ['data:read'] },
        actor(['role:write', 'data:read']),
      ) as Promise<{ _id: unknown }>,
    );

    // The whole point: no assignment happens, so the assignment-time check never
    // runs. Before the fix this resolved and the permission was written.
    await expect(
      service.update(
        String(role._id),
        { permissions: ['data:read', 'user:write'] },
        actor(['role:write', 'data:read']),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_GRANT' });

    const after = await Role.findById(role._id).select('permissions').lean();
    expect(after?.permissions).not.toContain('user:write');
  });

  it('still allows REMOVING a permission, and keeping one already present', async () => {
    /**
     * Built by a platform administrator FOR this customer, carrying a grant the
     * customer's own admin does not hold. Renaming it must not become impossible.
     *
     * `isSwitched` is load-bearing: a super admin who is NOT switched creates a
     * SHARED role (`organizationId: null`), and a customer may not edit those at
     * all — so without it this would fail on ownership rather than exercise the
     * additions-only rule it is here to test.
     */
    const role = await track(
      service.create(
        { name: `ESCALATION-${STAMP} inherited`, permissions: ['data:read', 'user:write'] },
        { ...actor([]), isSuperAdmin: true, isSwitched: true },
      ) as Promise<{ _id: unknown }>,
    );

    const kept = await service.update(
      String(role._id),
      { name: `ESCALATION-${STAMP} renamed`, permissions: ['data:read', 'user:write'] },
      actor(['role:write', 'data:read']),
    );
    expect(kept).toBeTruthy();

    const shrunk = await service.update(
      String(role._id),
      { permissions: ['data:read'] },
      actor(['role:write', 'data:read']),
    );
    expect(shrunk?.permissions).toEqual(['data:read']);
  });

  it('lets a super admin grant anything', async () => {
    const role = await track(
      service.create(
        { name: `ESCALATION-${STAMP} sup`, permissions: ['data:read', 'user:write', 'role:delete'] },
        { ...actor([]), isSuperAdmin: true },
      ) as Promise<{ _id: unknown }>,
    );
    expect(role).toBeTruthy();
  });
});
