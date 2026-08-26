import 'dotenv/config';
import mongoose from 'mongoose';

import { PERMISSIONS, PERMISSION_GROUPS, SEEDED_ROLES, isPermission, sanitizePermissions } from '../src/common/permissions';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';

/**
 * Permission catalogue and seeded roles (M18 W1).
 *
 * The catalogue lives in code precisely so these can be checked: a grant naming a
 * permission nothing enforces is a lie that no runtime test could catch.
 */

jest.setTimeout(60_000);

describe('permission catalogue', () => {
  it('has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('uses a consistent resource:action shape', () => {
    for (const p of PERMISSIONS) expect(p).toMatch(/^[a-z]+:[a-zA-Z]+$/);
  });

  it('recognises real permissions and rejects invented ones', () => {
    expect(isPermission('data:read')).toBe(true);
    expect(isPermission('data:destroy')).toBe(false);
    expect(isPermission('')).toBe(false);
  });

  it('drops unknown grants rather than storing them', () => {
    // A stored grant can outlive the permission it names — a rename must not
    // resurrect a meaningless entry.
    expect(sanitizePermissions(['data:read', 'made:up', 'data:read'])).toEqual(['data:read']);
  });

  it('returns grants sorted, so two equal sets compare equal', () => {
    // The role-editor diff and the "permissions differ" check both rely on this.
    expect(sanitizePermissions(['user:write', 'data:read'])).toEqual(['data:read', 'user:write']);
  });

  it('groups every permission for the editor, with none listed twice', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives every permission a plain-English label', () => {
    // The person assigning a role is not a developer.
    for (const g of PERMISSION_GROUPS) {
      for (const p of g.permissions) {
        expect(p.label.length).toBeGreaterThan(3);
        expect(p.label).not.toContain(':');
      }
    }
  });
});

describe('seeded roles', () => {
  it('grants only real permissions', () => {
    for (const role of SEEDED_ROLES) {
      for (const p of role.permissions) expect(isPermission(p)).toBe(true);
    }
  });

  it('escalates cleanly: viewer ⊂ operator ⊂ admin', () => {
    const of = (key: string) => new Set(SEEDED_ROLES.find((r) => r.key === key)!.permissions);
    const [viewer, operator, admin] = [of('viewer'), of('operator'), of('admin')];
    for (const p of viewer) expect(operator.has(p)).toBe(true);
    for (const p of operator) expect(admin.has(p)).toBe(true);
  });

  it('keeps a viewer read-only', () => {
    const viewer = SEEDED_ROLES.find((r) => r.key === 'viewer')!;
    // `data:export` is the one exception, and is deliberate — exporting is reading.
    const writes = viewer.permissions.filter((p) => /:(write|delete|create|provision|revokeAny)$/.test(p));
    expect(writes).toEqual([]);
  });

  it('does not let an org admin delete roles or provision stations', () => {
    // Both are platform-level: a customer must not be able to remove a system
    // role, nor create OS-level station logins on the ingest box.
    const admin = SEEDED_ROLES.find((r) => r.key === 'admin')!;
    expect(admin.permissions).not.toContain('role:delete');
    expect(admin.permissions).not.toContain('station:provision');
  });

  it('has no Super Admin role — it is a flag, not a role', () => {
    // A role lives inside one organisation; the super admin is precisely the
    // identity that does not.
    expect(SEEDED_ROLES.map((r) => r.key)).toEqual(['admin', 'operator', 'viewer']);
  });
});

describe('seeded roles in the database', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('exists as system roles shared by every organisation', async () => {
    const roles = await Role.find({ organizationId: null, isSystem: true, deletedAt: null }).lean();
    expect(roles.map((r) => r.key).sort()).toEqual(['admin', 'operator', 'viewer']);
  });

  // `@test.invalid` is reserved for fixtures created by other suites running in
  // parallel, which deliberately pair a role key with a mismatched legacy key to
  // exercise reassignment. The invariants below are about REAL data.
  const realUsers = { email: { $not: /@test\.invalid$/ } };

  it('has attached every user to a role', async () => {
    expect(await User.countDocuments({ ...realUsers, roleId: null })).toBe(0);
  });

  it('matches each user\'s legacy role key to the role it points at', async () => {
    // `role` is a denormalised mirror the JWT and RolesGuard still read; a drift
    // between the two would silently change what a guard allows.
    const users = await User.find(realUsers).select('role roleId').lean();
    const roles = await Role.find({}).select('key').lean();
    const keyById = new Map(roles.map((r) => [String(r._id), r.key]));
    for (const u of users) expect(keyById.get(String(u.roleId))).toBe(u.role);
  });

  it('frees a role key when the role is soft-deleted', async () => {
    // The unique index is PARTIAL on deletedAt:null — a plain unique index would
    // make deletion permanently reserve the key.
    const key = `test-role-${Date.now()}`;
    const first = await Role.create({ organizationId: null, key, name: 'Temp', permissions: ['data:read'] });
    await Role.updateOne({ _id: first._id }, { $set: { deletedAt: new Date() } });
    const second = await Role.create({ organizationId: null, key, name: 'Temp again', permissions: ['data:read'] });
    expect(String(second._id)).not.toBe(String(first._id));
    await Role.deleteMany({ key });
  });
});
