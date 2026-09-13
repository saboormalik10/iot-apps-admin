/**
 * The permission catalogue.
 *
 * WHY THIS IS CODE, NOT A COLLECTION
 * A permission only means something if some endpoint enforces it. Storing the
 * catalogue in the database would let a row exist for a permission nothing checks
 * — a lie that no test or type can catch. Defining it here means the compiler
 * rejects a typo and every grant is traceable to a real guard.
 *
 * Only GRANTS are persisted (Role.permissions), never the catalogue itself.
 *
 * NAMING: `<resource>:<action>`, resource singular. `read` never implies `write`;
 * a role that can do both is granted both, so a grant list always reads as the
 * complete truth about what that role can do.
 */

export const PERMISSIONS = [
  // Data surfaces — dashboards, analytics, maps, records
  'data:read',
  'data:export',
  // Named for commenting and uploads, both of which are gone. What it still
  // gates is editing and deleting RECORDS — see HIDDEN_PERMISSIONS.
  'content:write',

  // Devices
  'device:read',
  'device:write',
  'device:delete',

  // Station provisioning (M21)
  //
  // `ingest:read` was removed in M25: no endpoint ever exposed ingest history to a
  // customer, so it was a catalogue row for a screen that does not exist — exactly
  // the lie the header of this file says storing the catalogue in the database
  // would allow. Re-add it in the same commit as the screen, not before.
  'station:provision',

  // Organisation & branding
  'org:read',
  'org:write',

  // People
  'user:read',
  'user:write',

  // Roles (M18 W3/W4)
  'role:read',
  'role:write',
  'role:delete',

  // Everything else
  'audit:read',
  'alert:read',
  'alert:write',
  // `share:create` was removed in M25 as a DUPLICATE: `data:export` is labelled
  // "Export data and create share links" and every role that had one had the
  // other. Two names for one grant is how a role ends up meaning different things
  // in the editor and in the guard. POST /share is gated on `data:export`; only
  // revoking SOMEONE ELSE'S link needs a grant of its own.
  'share:revokeAny',
  'import:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Drops anything not in the catalogue — a stored grant can outlive its permission. */
export function sanitizePermissions(values: readonly string[]): Permission[] {
  return [...new Set(values.filter(isPermission))].sort() as Permission[];
}

/**
 * Permissions the role editor does NOT offer.
 *
 * Hidden, not removed. The grant still exists, is still enforced, and is still
 * held by anyone who has it — so nothing silently loses access and the endpoint
 * keeps working. It simply is not a box somebody can tick.
 *
 * `import:write` gates the historical-CSV import, and the Import screen is
 * switched off in the frontend (`importExport: false`). Offering a permission
 * for a screen that cannot be reached invites someone to grant it and then
 * wonder why nothing appeared. When the screen comes back, take the entry out
 * of here and put it back in the Advanced group.
 *
 * `content:write` was labelled "Add comments and upload files" and no longer
 * does either: session comments went with the NEP module and picture upload is
 * commented out. What it actually still gates is EDITING AND DELETING RECORDS,
 * so the box invited someone to grant record deletion while reading as though it
 * granted commenting. The two device-facing endpoints under it are dead as well
 * — every record in the system arrived over SFTP, which uses its own credential
 * guard. Hidden rather than deleted so existing holders keep working and the
 * endpoints keep their check.
 *
 * Deleting it from `PERMISSIONS` instead would be wrong twice over:
 * `sanitizePermissions` would strip it out of every stored role on next write,
 * and `PermissionsGuard` would stop recognising it on a route that still
 * requires it.
 */
export const HIDDEN_PERMISSIONS: readonly Permission[] = Object.freeze([
  'import:write',
  'content:write',
]);

/**
 * Offered to a platform administrator, never to a customer.
 *
 * Stations are a platform concern in this deployment: they are provisioned from
 * the platform screen, against SFTP accounts only a platform administrator can
 * create. A customer does not stand up their own station, so the permissions
 * that describe doing so are not theirs to hand out.
 *
 *   `station:provision` — creates an OS-level SFTP login on the ingest box. Its
 *     endpoint is behind `SuperAdminGuard` as well as the permission, so a
 *     customer holding it is refused anyway; the box only implied otherwise.
 *   `device:write` — adding and editing stations. The Add-station control, the
 *     firmware target and the device-settings screen have all been removed from
 *     the customer side, so what remains of it is renaming.
 *
 * Kept visible to a platform administrator so the catalogue they see is the
 * whole truth, and because the grant is what documents the boundary.
 *
 * NOTE this hides the CHECKBOX, not the ability. Organisation Admin still holds
 * `device:write` from its seeded grant, so an admin can still rename their own
 * station — they simply cannot delegate that to a role they build. Remove it
 * from SEEDED_ROLES too if the ability itself should go.
 *
 * A different rule from HIDDEN_PERMISSIONS: hidden from EVERYONE versus hidden
 * from CUSTOMERS. `visiblePermissionGroups` applies both.
 */
export const PLATFORM_ONLY_PERMISSIONS: readonly Permission[] = Object.freeze([
  'station:provision',
  'device:write',
]);

/**
 * The catalogue as a given audience should see it.
 *
 * Empty groups are dropped rather than rendered as an empty heading — "Stations"
 * with nothing under it reads like a loading failure.
 */
export function visiblePermissionGroups(opts: { isSuperAdmin: boolean }) {
  const hide = new Set<string>([
    ...HIDDEN_PERMISSIONS,
    ...(opts.isSuperAdmin ? [] : PLATFORM_ONLY_PERMISSIONS),
  ]);
  return PERMISSION_GROUPS.map((g) => ({
    ...g,
    permissions: g.permissions.filter((p) => !hide.has(p.key)),
  })).filter((g) => g.permissions.length > 0);
}

/**
 * Grouped for the role editor, so the UI never hard-codes its own list.
 * Labels are plain English: the person assigning a role is not a developer.
 */
export const PERMISSION_GROUPS: readonly { group: string; permissions: readonly { key: Permission; label: string }[] }[] =
  Object.freeze([
    {
      group: 'Data',
      permissions: [
        { key: 'data:read', label: 'View dashboards and analytics' },
        { key: 'data:export', label: 'Export data and create share links' },
      ],
    },
    {
      group: 'Stations',
      permissions: [
        { key: 'device:read', label: 'View stations' },
        { key: 'device:write', label: 'Add and edit stations' },
        { key: 'device:delete', label: 'Remove stations' },
        { key: 'station:provision', label: 'Provision new station logins' },
      ],
    },
    {
      group: 'Alerts',
      permissions: [
        { key: 'alert:read', label: 'View alert rules' },
        { key: 'alert:write', label: 'Create and edit alert rules' },
      ],
    },
    {
      group: 'Organisation',
      permissions: [
        { key: 'org:read', label: 'View organisation settings' },
        { key: 'org:write', label: 'Edit organisation settings and branding' },
        { key: 'user:read', label: 'View people' },
        { key: 'user:write', label: 'Add and edit people' },
        { key: 'role:read', label: 'View roles' },
        { key: 'role:write', label: 'Create and edit roles' },
        { key: 'role:delete', label: 'Delete roles' },
        { key: 'audit:read', label: 'View the audit log' },
      ],
    },
    {
      group: 'Advanced',
      permissions: [
        // `import:write` is deliberately absent — see HIDDEN_PERMISSIONS.
        { key: 'share:revokeAny', label: "Revoke anyone's share links" },
      ],
    },
  ]);

/**
 * The three seeded roles.
 *
 * Derived from the frontend's existing capability matrix (lib/rbac/capabilities.ts)
 * so behaviour does not change the day this ships — a user who could do something
 * yesterday can still do it today. The catalogue is finer-grained than that matrix
 * was, which is the point: `manageOrg` previously bundled users, roles, branding
 * and the audit log into one all-or-nothing grant.
 *
 * Super Admin is deliberately absent: it is a FLAG on the user, not a role, so it
 * sits above every organisation rather than inside one.
 */
export const SEEDED_ROLES: readonly { key: string; name: string; description: string; permissions: Permission[] }[] =
  Object.freeze([
    {
      key: 'admin',
      name: 'Organisation Admin',
      description: 'Full control of this organisation: stations, people, branding and alerts.',
      permissions: [
        'data:read', 'data:export', 'content:write',
        'device:read', 'device:write', 'device:delete',
        'org:read', 'org:write',
        'user:read', 'user:write',
        // Customers manage THEIR OWN roles (M26): create, edit and delete.
        // Everything with `organizationId: null` — the built-ins and any shared
        // role a platform administrator built — stays read-only to them, which
        // `assertCanModify` enforces. `assertCanGrant` separately stops a role
        // being used to mint a permission its author does not already hold, so
        // this widens what an admin can ORGANISE, never what they can reach.
        'role:read', 'role:write', 'role:delete',
        'audit:read',
        'alert:read', 'alert:write',
        'share:revokeAny',
        'import:write',
      ],
    },
    {
      key: 'operator',
      name: 'Operator',
      description: 'Day-to-day use: view everything, manage alerts and export.',
      permissions: [
        // `content:write` removed (M26). Its label said "add comments and upload
        // files" and both of those are gone — what it actually still grants is
        // EDITING AND DELETING RECORDS, which is not a day-to-day operator task
        // and was never what anyone thought they were handing over. Admin keeps
        // it so a bad record can still be corrected.
        'data:read', 'data:export',
        'device:read',
        'org:read', 'user:read',
        'alert:read', 'alert:write',
      ],
    },
    {
      key: 'viewer',
      name: 'Viewer',
      description: 'Read-only access to dashboards, analytics and exports.',
      permissions: ['data:read', 'data:export', 'device:read', 'org:read', 'alert:read'],
    },
  ]);

/**
 * Whether a token's bearer holds `permission`, for the cases a guard cannot cover.
 *
 * `PermissionsGuard` answers "may this request happen at all". This answers the
 * narrower question a handler sometimes has to ask ITSELF — "may it happen to
 * *this* row" — where the permission decides scope rather than access. Revoking a
 * share link is the case in point: everyone may revoke their own, only
 * `share:revokeAny` reaches someone else's, and that is one query filter, not two
 * routes.
 *
 * Mirrors the guard's fallback exactly (super admin wildcard, then `perms`, then
 * the seeded set for a token minted before M18) so the two can never disagree.
 */
export function actorHasPermission(
  actor: { perms?: string[]; sup?: boolean; role?: string },
  permission: Permission,
): boolean {
  if (actor.sup === true) return true;
  if (actor.perms?.length) return actor.perms.includes(permission);
  const seeded = SEEDED_ROLES.find((r) => r.key === actor.role);
  return seeded ? (seeded.permissions as readonly string[]).includes(permission) : false;
}
