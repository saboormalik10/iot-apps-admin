import 'dotenv/config';
import mongoose from 'mongoose';

import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  HIDDEN_PERMISSIONS,
  PLATFORM_ONLY_PERMISSIONS,
  SEEDED_ROLES,
  isPermission,
  sanitizePermissions,
  visiblePermissionGroups,
} from '../src/common/permissions';
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

  it('never both hides globally and restricts to the platform', () => {
    // The two lists answer different questions; overlapping them would make the
    // reason a permission is missing ambiguous.
    expect(HIDDEN_PERMISSIONS.filter((p) => PLATFORM_ONLY_PERMISSIONS.includes(p))).toEqual([]);
  });

  it('accounts for every permission — grouped for the editor, or explicitly hidden', () => {
    /**
     * The point is that nothing falls through the gap. A permission the editor
     * does not show is fine when it is a DECLARED omission; one that is merely
     * missing is a permission nobody can ever grant, with nothing to say so.
     */
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped, ...HIDDEN_PERMISSIONS].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('never both hides and offers the same permission', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(HIDDEN_PERMISSIONS.filter((p) => grouped.includes(p))).toEqual([]);
  });

  it('keeps a hidden permission in the catalogue, so it is still enforced', () => {
    // Hidden is a UI decision. Dropping it from PERMISSIONS would make
    // `sanitizePermissions` strip it from stored roles and the guard stop
    // recognising it on a route that still requires it.
    for (const p of HIDDEN_PERMISSIONS) expect(isPermission(p)).toBe(true);
    expect(SEEDED_ROLES.find((r) => r.key === 'admin')!.permissions).toContain('import:write');
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

  it('does not let an OPERATOR edit or delete records', () => {
    /**
     * `content:write` reads as "add comments and upload files" and grants
     * neither — comments went with the NEP module and picture upload is
     * commented out. What it still gates is PATCH and DELETE on a record, which
     * is not a day-to-day operator task, and nobody handing out "Operator"
     * intended to hand over record deletion.
     *
     * Admin keeps it so a bad record can still be corrected.
     */
    const operator = SEEDED_ROLES.find((r) => r.key === 'operator')!;
    const admin = SEEDED_ROLES.find((r) => r.key === 'admin')!;
    expect(operator.permissions).not.toContain('content:write');
    expect(admin.permissions).toContain('content:write');
  });

  it('lets an org admin manage THEIR OWN roles, but never provision stations', () => {
    const admin = SEEDED_ROLES.find((r) => r.key === 'admin')!;

    /**
     * Role management became a customer capability (M26): they create, edit and
     * delete roles of their own. The grant is not what keeps that safe —
     * `assertCanModify` refuses anything with `organizationId: null` (the
     * built-ins and any shared role), and `assertCanGrant` refuses a permission
     * the author does not already hold. So this widens what an admin can
     * ORGANISE, never what they can reach.
     */
    expect(admin.permissions).toContain('role:write');
    expect(admin.permissions).toContain('role:delete');

    // `station:provision` is different in kind: it mints OS-level logins on the
    // ingest box, so it stays platform-only — and is additionally behind
    // SuperAdminGuard, not the permission alone.
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

/**
 * Who sees which permissions in the role editor.
 *
 * `station:provision` mints an OS-level SFTP login on the ingest box. Its
 * endpoint is behind `SuperAdminGuard` as well as the permission, so a customer
 * holding it is refused anyway — the box did nothing except imply it would.
 */
describe('permission catalogue by audience', () => {
  const keys = (isSuperAdmin: boolean) =>
    visiblePermissionGroups({ isSuperAdmin }).flatMap((g) => g.permissions.map((p) => p.key));

  it('hides station provisioning from a customer', () => {
    expect(keys(false)).not.toContain('station:provision');
  });

  it('still shows it to a platform administrator', () => {
    expect(keys(true)).toContain('station:provision');
  });

  it('hides the globally hidden ones from EVERYONE, platform administrators included', () => {
    for (const p of HIDDEN_PERMISSIONS) {
      expect(keys(false)).not.toContain(p);
      expect(keys(true)).not.toContain(p);
    }
  });

  it('shows a customer everything else', () => {
    const expected = PERMISSIONS.filter(
      (p) => !HIDDEN_PERMISSIONS.includes(p) && !PLATFORM_ONLY_PERMISSIONS.includes(p),
    );
    expect([...keys(false)].sort()).toEqual([...expected].sort());
  });

  it('drops a group left empty rather than rendering a bare heading', () => {
    for (const g of visiblePermissionGroups({ isSuperAdmin: false })) {
      expect(g.permissions.length).toBeGreaterThan(0);
    }
  });

  it('does not mutate the source catalogue', () => {
    const before = JSON.stringify(PERMISSION_GROUPS);
    visiblePermissionGroups({ isSuperAdmin: false });
    expect(JSON.stringify(PERMISSION_GROUPS)).toBe(before);
  });
});

