import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';
import { Organization } from '../src/models/Organization';
import { RolesService, type RoleActor } from '../src/roles/roles.service';

/**
 * What a CUSTOMER may see and change on the Roles page.
 *
 * Three rules, and the first two were wrong:
 *
 *  1. Every shared role was visible to every customer, so a role built for one
 *     customer appeared in everyone's list.
 *  2. `usage()` returned the NAME AND EMAIL of every holder with no organisation
 *     filter. The built-in roles are shared, so any customer — Viewer included,
 *     since they hold `role:read` — could ask who holds "Organisation Admin" and
 *     be handed the people at every other customer.
 *  3. Only `isSystem` roles were protected from editing, so a shared CUSTOM role
 *     was editable and deletable by any customer. Harmless while nobody held
 *     `role:write`; not harmless now that Organisation Admin does.
 */
jest.setTimeout(120_000);

const STAMP = Date.now();

describe('role visibility and ownership for a customer (e2e)', () => {
  let app: INestApplication;
  let svc: RolesService;
  let orgA: mongoose.Types.ObjectId;
  let orgB: mongoose.Types.ObjectId;
  const madeRoles: mongoose.Types.ObjectId[] = [];
  const madeUsers: mongoose.Types.ObjectId[] = [];
  const madeOrgs: mongoose.Types.ObjectId[] = [];

  const customer = (org: mongoose.Types.ObjectId): RoleActor => ({
    userId: new mongoose.Types.ObjectId().toString(),
    email: `vis-${STAMP}@example.invalid`,
    organizationId: String(org),
    isSuperAdmin: false,
    perms: ['role:read', 'role:write', 'role:delete', 'data:read'],
  });
  const superAdmin = (): RoleActor => ({ ...customer(orgA), isSuperAdmin: true });

  const mkOrg = async (tag: string) => {
    const o = await Organization.create({
      name: `VIS ${tag} ${STAMP}`, slug: `vis-${tag}-${STAMP}`,
      contactEmail: `vis-${tag}-${STAMP}@example.invalid`, country: 'AU', timezone: 'Australia/Sydney',
    });
    madeOrgs.push(o._id as mongoose.Types.ObjectId);
    return o._id as mongoose.Types.ObjectId;
  };

  const mkRole = async (name: string, organizationId: mongoose.Types.ObjectId | null, isSystem = false) => {
    const r = await Role.create({
      organizationId, key: `vis-${name}-${STAMP}`.toLowerCase().replace(/\s+/g, '-'),
      name: `VIS ${name} ${STAMP}`, description: 't', permissions: ['data:read'],
      baseRole: 'viewer', isSystem,
    });
    madeRoles.push(r._id as mongoose.Types.ObjectId);
    return r;
  };

  const mkUser = async (org: mongoose.Types.ObjectId, roleId: mongoose.Types.ObjectId | null, n: number) => {
    const u = await User.create({
      organizationId: org, email: `vis-${STAMP}-${n}@example.invalid`, passwordHash: 'x',
      firstName: 'V', lastName: String(n), role: 'viewer', isActive: true, roleId,
    });
    madeUsers.push(u._id as mongoose.Types.ObjectId);
    return u;
  };

  const names = async (actor: RoleActor) => (await svc.list(actor)).map((r) => r.name);

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    svc = app.get(RolesService);
    orgA = await mkOrg('a');
    orgB = await mkOrg('b');
  });

  afterAll(async () => {
    await User.deleteMany({ _id: { $in: madeUsers } });
    await Role.deleteMany({ _id: { $in: madeRoles } });
    await Organization.deleteMany({ _id: { $in: madeOrgs } });
    await app?.close();
    await mongoose.disconnect();
  });

  it('hides a shared custom role NOBODY holds', async () => {
    const shared = await mkRole('unheld', null);
    expect(await names(customer(orgA))).not.toContain(shared.name);
    // The platform administrator who built it still sees it.
    expect(await names(superAdmin())).toContain(shared.name);
  });

  it('shows a shared custom role once one of THEIR OWN people holds it', async () => {
    const shared = await mkRole('held', null);
    await mkUser(orgA, shared._id as mongoose.Types.ObjectId, 1);

    expect(await names(customer(orgA))).toContain(shared.name);
    // …and stays hidden from the customer who does not hold it.
    expect(await names(customer(orgB))).not.toContain(shared.name);
  });

  it('always shows the BUILT-IN roles', async () => {
    const listed = await names(customer(orgB));
    for (const n of ['Organisation Admin', 'Operator', 'Viewer']) expect(listed).toContain(n);
  });

  it('shows a role the customer’s own organisation created, and hides another customer’s', async () => {
    const mine = await mkRole('mine', orgA);
    const theirs = await mkRole('theirs', orgB);
    const listed = await names(customer(orgA));
    expect(listed).toContain(mine.name);
    expect(listed).not.toContain(theirs.name);
  });

  it('does NOT leak other customers’ people through a shared role’s usage', async () => {
    const shared = await mkRole('usage', null);
    await mkUser(orgA, shared._id as mongoose.Types.ObjectId, 10);
    const foreign = await mkUser(orgB, shared._id as mongoose.Types.ObjectId, 11);

    const seen = await svc.usage(String(shared._id), customer(orgA));
    expect(seen.userCount).toBe(1);
    expect(seen.users.map((u) => u.email)).not.toContain(foreign.email);

    // The platform administrator legitimately sees both.
    expect((await svc.usage(String(shared._id), superAdmin())).userCount).toBe(2);
  });

  it('refuses to let a customer EDIT a shared role, built-in or not', async () => {
    const shared = await mkRole('noedit', null);
    await expect(
      svc.update(String(shared._id), { name: 'hijacked' }, customer(orgA)),
    ).rejects.toMatchObject({ statusCode: 403 });

    const builtIn = await Role.findOne({ organizationId: null, key: 'admin', deletedAt: null }).lean();
    await expect(
      svc.update(String(builtIn!._id), { permissions: ['data:read'] }, customer(orgA)),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses to let a customer DELETE a shared role', async () => {
    const shared = await mkRole('nodelete', null);
    await expect(svc.remove(String(shared._id), customer(orgA))).rejects.toMatchObject({ statusCode: 403 });
    expect(await Role.findById(shared._id).lean()).toBeTruthy();
  });

  it('lets a customer create, edit and delete a role of their OWN', async () => {
    const made = await svc.create(
      { name: `VIS own ${STAMP}`, permissions: ['data:read'] },
      customer(orgA),
    );
    madeRoles.push((made as { _id: mongoose.Types.ObjectId })._id);

    const id = String((made as { _id: unknown })._id);
    expect(await svc.update(id, { description: 'edited' }, customer(orgA))).toBeTruthy();
    await expect(svc.remove(id, customer(orgA))).resolves.not.toThrow();
  });
});
