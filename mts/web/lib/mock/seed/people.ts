import type { Role, User } from '@/lib/api/types';

/**
 * The people on the user-management screen. The first eight are the client's
 * Figure 14 exactly — seven active and one suspended, P. Nair holding two roles,
 * one still invited. The rest fill the directory out to something the size of a
 * real corridor roster, because a user screen with eight rows never shows what
 * searching, filtering or paging through it will actually feel like.
 *
 * Every acknowledgement, audit entry and pump command in the prototype is
 * attributed to DEMO_USER, so two screens can never show different actors for the
 * same action.
 */

export const ROLES: Role[] = [
  {
    id: 'administrator',
    name: 'Administrator',
    typicalUser: 'System owner / IT',
    summary: 'Full control: users, roles, thresholds, recipients, and every view and control function.',
    permissions: [
      'View all dashboards and history',
      'Acknowledge alerts',
      'Manage users and roles',
      'Configure thresholds and alert wording',
      'Manage alert recipients',
      'Supervised pump control',
      'Maintenance mode',
      'Export data',
      'View audit trail',
    ],
  },
  {
    id: 'operator',
    name: 'Operator',
    typicalUser: 'OCC / control room',
    summary:
      'View all live dashboards and history, receive and acknowledge alerts, initiate operational responses. Cannot manage users or change configuration.',
    permissions: [
      'View all dashboards and history',
      'Acknowledge alerts',
      'Export data',
    ],
  },
  {
    id: 'pump-controller',
    name: 'Pump Controller',
    typicalUser: 'Authorised operations staff',
    summary:
      'Everything an Operator may do, plus supervised manual pump start/stop — MANUAL mode with confirmation — at permitted stations.',
    permissions: [
      'View all dashboards and history',
      'Acknowledge alerts',
      'Supervised pump control',
      'Export data',
    ],
  },
  {
    id: 'maintainer',
    name: 'Maintainer / Technician',
    typicalUser: 'Field and maintenance',
    summary:
      'Device and power health, calibration and fault flags, maintenance mode; acknowledges maintenance alerts; limited configuration.',
    permissions: [
      'View all dashboards and history',
      'Acknowledge alerts',
      'Maintenance mode',
      'Calibration and fault flags',
      'Export data',
    ],
  },
  {
    id: 'analyst',
    name: 'Analyst / Reporting',
    typicalUser: 'Engineering and reporting',
    summary: 'Historical query engine, trend analysis and CSV export. No live control.',
    permissions: ['View all dashboards and history', 'Export data'],
  },
  {
    id: 'viewer',
    name: 'Viewer',
    typicalUser: 'Stakeholders',
    summary: 'View dashboards and history only. No actions, no changes.',
    permissions: ['View all dashboards and history'],
  },
];

export const ROLES_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<Role['id'], Role>;

/** Minutes ago, so "last login" moves with the demo clock rather than a fixed date. */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const USERS: User[] = [
  {
    id: 'u-chen',
    name: 'Sarah Chen',
    email: 's.chen@metrotrains.com.au',
    initials: 'SC',
    roles: ['administrator'],
    stationAccess: 'all',
    status: 'active',
    lastLogin: -10 * MIN,
  },
  {
    id: 'u-okoro',
    name: 'James Okoro',
    email: 'j.okoro@metrotrains.com.au',
    initials: 'JO',
    roles: ['operator'],
    stationAccess: 'all',
    status: 'active',
    lastLogin: -27 * MIN,
  },
  {
    id: 'u-nair',
    name: 'Priya Nair',
    email: 'p.nair@metrotrains.com.au',
    initials: 'PN',
    roles: ['pump-controller', 'operator'],
    stationAccess: ['marrickville'],
    status: 'active',
    lastLogin: -42 * MIN,
  },
  {
    id: 'u-reilly',
    name: 'Tom Reilly',
    email: 't.reilly@contractor.com',
    initials: 'TR',
    roles: ['maintainer'],
    stationAccess: 'all',
    status: 'active',
    lastLogin: -22 * HOUR,
  },
  {
    id: 'u-khan',
    name: 'Aisha Khan',
    email: 'a.khan@metrotrains.com.au',
    initials: 'AK',
    roles: ['analyst'],
    stationAccess: 'all',
    status: 'active',
    lastLogin: -2 * DAY,
  },
  {
    id: 'u-smith',
    name: 'David Smith',
    email: 'd.smith@metrotrains.com.au',
    initials: 'DS',
    roles: ['viewer'],
    stationAccess: ['belmore', 'campsie'],
    status: 'active',
    lastLogin: -3 * DAY,
  },
  {
    id: 'u-lee',
    name: 'Mark Lee',
    email: 'm.lee@metrotrains.com.au',
    initials: 'ML',
    roles: ['operator'],
    stationAccess: 'all',
    status: 'suspended',
    lastLogin: -12 * DAY,
  },
  {
    id: 'u-wilson',
    name: 'Emma Wilson',
    email: 'e.wilson@metrotrains.com.au',
    initials: 'EW',
    roles: ['viewer'],
    stationAccess: 'all',
    status: 'invited',
  },
  { id: 'u-hale', name: 'Nina Hale', email: 'n.hale@metrotrains.com.au', initials: 'NH', roles: ['operator'], stationAccess: 'all', status: 'active', lastLogin: -3 * HOUR },
  { id: 'u-berg', name: 'Otto Berg', email: 'o.berg@metrotrains.com.au', initials: 'OB', roles: ['pump-controller'], stationAccess: ['marrickville'], status: 'active', lastLogin: -6 * HOUR },
  { id: 'u-diaz', name: 'Carla Diaz', email: 'c.diaz@metrotrains.com.au', initials: 'CD', roles: ['operator', 'analyst'], stationAccess: 'all', status: 'active', lastLogin: -9 * HOUR },
  { id: 'u-obrien', name: 'Sean O\u2019Brien', email: 's.obrien@contractor.com', initials: 'SO', roles: ['maintainer'], stationAccess: ['lady-game-drive', 'windsor-road'], status: 'active', lastLogin: -30 * HOUR },
  { id: 'u-patel', name: 'Ravi Patel', email: 'r.patel@metrotrains.com.au', initials: 'RP', roles: ['analyst'], stationAccess: 'all', status: 'active', lastLogin: -4 * DAY },
  { id: 'u-novak', name: 'Lena Novak', email: 'l.novak@metrotrains.com.au', initials: 'LN', roles: ['operator'], stationAccess: 'all', status: 'active', lastLogin: -50 * MIN },
  { id: 'u-adeyemi', name: 'Tayo Adeyemi', email: 't.adeyemi@metrotrains.com.au', initials: 'TA', roles: ['viewer'], stationAccess: ['canterbury', 'campsie'], status: 'active', lastLogin: -5 * DAY },
  { id: 'u-fraser', name: 'Kate Fraser', email: 'k.fraser@metrotrains.com.au', initials: 'KF', roles: ['administrator'], stationAccess: 'all', status: 'active', lastLogin: -80 * MIN },
  { id: 'u-tanaka', name: 'Hiro Tanaka', email: 'h.tanaka@contractor.com', initials: 'HT', roles: ['maintainer'], stationAccess: 'all', status: 'suspended', lastLogin: -21 * DAY },
  { id: 'u-brooks', name: 'Gemma Brooks', email: 'g.brooks@metrotrains.com.au', initials: 'GB', roles: ['operator'], stationAccess: 'all', status: 'active', lastLogin: -7 * HOUR },
  { id: 'u-quinn', name: 'Alex Quinn', email: 'a.quinn@metrotrains.com.au', initials: 'AQ', roles: ['pump-controller', 'maintainer'], stationAccess: ['marrickville', 'marrickville-dulwich-hill'], status: 'active', lastLogin: -14 * HOUR },
  { id: 'u-mensah', name: 'Kofi Mensah', email: 'k.mensah@metrotrains.com.au', initials: 'KM', roles: ['analyst'], stationAccess: 'all', status: 'invited' },
  { id: 'u-rossi', name: 'Marco Rossi', email: 'm.rossi@metrotrains.com.au', initials: 'MR', roles: ['viewer'], stationAccess: ['belmore'], status: 'active', lastLogin: -9 * DAY },
  { id: 'u-shaw', name: 'Beth Shaw', email: 'b.shaw@metrotrains.com.au', initials: 'BS', roles: ['operator'], stationAccess: 'all', status: 'active', lastLogin: -2 * HOUR },
];

/**
 * Who the prototype is signed in as. Every acknowledgement and command is
 * attributed here, and the "view as" switch in the demo dock changes only which
 * roles this person appears to hold.
 */
/*
 * An Administrator, because the demo's navigation includes Admin, Roles, Rules and
 * the audit trail. Signed in as a Pump Controller — whose own roles matrix says
 * they may not open any of those — the prototype contradicted itself on the first
 * click. The "view as" switch in the demo dock is how the restricted roles are
 * shown.
 */
export const DEMO_USER = USERS.find((u) => u.id === 'u-chen')!;

/** Named recipient groups, as the rule drawer's chips refer to them. */
export const RECIPIENT_GROUPS = [
  { id: 'ops-controllers', label: 'Ops controllers', members: 6, description: 'OCC duty controllers, 24/7 roster' },
  { id: 'cjc-t', label: 'CJC-T', members: 4, description: 'Front-of-train patrol coordinators' },
  { id: 'maintenance', label: 'Maintenance', members: 3, description: 'Field technicians — faults and power' },
  { id: 'engineering', label: 'Engineering', members: 5, description: 'Reporting and post-event analysis' },
];
