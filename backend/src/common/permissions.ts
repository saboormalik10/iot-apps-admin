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
  'content:write', // record/session comments, file uploads

  // Devices
  'device:read',
  'device:write',
  'device:delete',

  // Ingest + station provisioning (M21)
  'ingest:read',
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
  'share:create',
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
        { key: 'content:write', label: 'Add comments and upload files' },
      ],
    },
    {
      group: 'Stations',
      permissions: [
        { key: 'device:read', label: 'View stations' },
        { key: 'device:write', label: 'Add and edit stations' },
        { key: 'device:delete', label: 'Remove stations' },
        { key: 'ingest:read', label: 'View ingest history' },
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
        { key: 'import:write', label: 'Import data files' },
        { key: 'share:create', label: 'Create share links' },
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
        'device:read', 'device:write', 'device:delete', 'ingest:read',
        'org:read', 'org:write',
        'user:read', 'user:write',
        'role:read',
        'audit:read',
        'alert:read', 'alert:write',
        'share:create', 'share:revokeAny',
        'import:write',
      ],
    },
    {
      key: 'operator',
      name: 'Operator',
      description: 'Day-to-day use: view everything, manage alerts, add comments and export.',
      permissions: [
        'data:read', 'data:export', 'content:write',
        'device:read', 'ingest:read',
        'org:read', 'user:read',
        'alert:read', 'alert:write',
        'share:create',
      ],
    },
    {
      key: 'viewer',
      name: 'Viewer',
      description: 'Read-only access to dashboards, analytics and exports.',
      permissions: ['data:read', 'data:export', 'device:read', 'org:read', 'alert:read'],
    },
  ]);
