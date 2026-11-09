import type {
  Organization,
  RecipientGroup,
  OrgRight,
  StationInput,
  StationMeasure,
  StationRecord,
  User,
} from '@/lib/api/types';
import { now } from './clock';
import { actingUser, recordAudit } from './api';
import { OTHER_ORG_USERS, USERS } from './seed/people';
import { ORGANISATIONS, RIGHT_LABELS } from './seed/orgs';
import { STATIONS } from './seed/stations';
import { getStore, mutate } from './store';
import { SHOW_EXTRAS } from '@/lib/extras';

/**
 * Organisations, their rights, and the station register (client requirement,
 * 3 Oct 2026).
 *
 * The rule the client set: the Super User can do everything; an organisation's
 * own Administrator may add users, stations or sensors only where the Super User
 * has granted that right, and every new organisation starts with all three off.
 * `can()` is the one place that rule lives — every Add button asks it.
 */

function settle<T>(value: T, ms = 140): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function actingAs(): 'org-admin' | 'super-user' {
  return getStore().actingAs;
}

export function setActingAs(who: 'org-admin' | 'super-user'): void {
  mutate((s) => {
    s.actingAs = who;
  });
}

function orgsNow(): Organization[] {
  const store = getStore();
  return [...ORGANISATIONS, ...store.addedOrgs].map((o) => ({
    ...o,
    rights: { ...o.rights, ...(store.orgRightEdits.get(o.id) ?? {}) },
  }));
}

export function organisationNow(id: string): Organization | undefined {
  return orgsNow().find((o) => o.id === id);
}

/** May the person signed in do this, in this organisation (MTS by default)? */
export function can(right: OrgRight, orgId = 'mts'): boolean {
  // The proposal has one MTS Administrator with full control; the per-organisation rights are an extra.
  if (!SHOW_EXTRAS || actingAs() === 'super-user') return true;
  return Boolean(organisationNow(orgId)?.rights[right].on);
}

export async function listOrganisations(): Promise<Organization[]> {
  const store = getStore();
  const people: User[] = [...USERS, ...OTHER_ORG_USERS, ...store.addedUsers].filter(
    (u) => !store.removedUsers.has(u.id),
  );
  const stations = stationRecordsNow();
  return settle(
    orgsNow().map((o) => ({
      ...o,
      userCount: people.filter((u) => (u.orgId ?? 'mts') === o.id).length,
      stationCount: stations.filter((s) => s.orgId === o.id).length,
    })),
  );
}

export async function createOrganisation(input: {
  name: string;
  code: string;
  region: string;
  adminName: string;
  adminEmail: string;
}): Promise<void> {
  const id = input.code.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const by = actingUser().name;
  mutate((s) => {
    s.addedOrgs.push({
      id,
      name: input.name,
      code: input.code.toUpperCase(),
      region: input.region,
      createdAt: now(),
      createdBy: by,
      // The client's rule: everything off until the Super User grants it.
      rights: { addUsers: { on: false }, addStations: { on: false }, addSensors: { on: false } },
      added: true,
    });
    s.addedUsers.push({
      id: `u-added-${s.addedUsers.length + 1}`,
      name: input.adminName,
      email: input.adminEmail,
      initials: input.adminName
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      roles: ['administrator'],
      stationAccess: 'all',
      orgId: id,
      status: 'invited',
    });
  });
  recordAudit(
    'Organisation created',
    `${input.name} (${input.code.toUpperCase()}) — rights to add users, stations and sensors all off; ${input.adminName} invited as Administrator`,
    'organisation',
  );
  return settle(undefined, 260);
}

export async function setOrgRight(orgId: string, right: OrgRight, on: boolean): Promise<void> {
  const org = organisationNow(orgId);
  mutate((s) =>
    s.orgRightEdits.set(orgId, {
      ...(s.orgRightEdits.get(orgId) ?? {}),
      [right]: { on, by: actingUser().name, at: now() },
    }),
  );
  recordAudit(
    on ? 'Right granted' : 'Right withdrawn',
    `${org?.name ?? orgId} — ${RIGHT_LABELS[right].label} for its Administrator`,
    'organisation',
  );
  return settle(undefined, 150);
}

// ── stations ────────────────────────────────────────────────────────────────

function measuresOf(s: (typeof STATIONS)[number]): StationMeasure[] {
  const has = (p: string) => s.sensors.some((x) => x.parameter === p);
  return [
    has('rainfall') && 'rain',
    has('water_level') && 'flood',
    has('temperature') && 'temp',
    has('wind_mean') && 'wind',
    s.pumpStation && 'pump',
  ].filter(Boolean) as StationMeasure[];
}

function stationRecordsNow(): StationRecord[] {
  const seeded: StationRecord[] = STATIONS.map((s) => ({
    id: s.id,
    orgId: 'mts',
    orgName: 'Metro Trains Sydney',
    name: s.name,
    ordinal: s.ordinal,
    chainage: s.chainage.label,
    loggerId: s.loggers.map((l) => l.id).join(', '),
    track: s.track,
    measures: measuresOf(s),
    status: 'live',
    createdAt: ORGANISATIONS[0].createdAt,
    createdBy: 'Platform Super User',
  }));
  return [...seeded, ...getStore().addedStations];
}

export async function listStationRecords(orgId: string | 'all' = 'all'): Promise<StationRecord[]> {
  return settle(stationRecordsNow().filter((s) => orgId === 'all' || s.orgId === orgId));
}

/** Registers the station and returns its id, so its sensors can be added straight after. */
export async function addStation(input: StationInput): Promise<string> {
  const org = organisationNow(input.orgId);
  const ordinal = stationRecordsNow().filter((s) => s.orgId === input.orgId).length + 1;
  const id = `st-added-${getStore().addedStations.length + 1}`;
  mutate((s) =>
    s.addedStations.push({
      ...input,
      id,
      orgName: org?.name ?? input.orgId,
      ordinal,
      status: 'commissioning',
      createdAt: now(),
      createdBy: actingUser().name,
      added: true,
    }),
  );
  recordAudit(
    'Station added',
    `${input.name} (Location ${ordinal}) — ${org?.name ?? input.orgId}, logger ${input.loggerId}. Commissioning.`,
    'station',
  );
  return settle(id, 240);
}

// ── recipient groups (Admin → Recipients) ───────────────────────────────────

/** The groups as they stand in this session, for the rule editor's chips. */
export function recipientGroupsNow(): RecipientGroup[] {
  return getStore().recipientGroups;
}

export async function listRecipientGroups(): Promise<RecipientGroup[]> {
  return settle(recipientGroupsNow().map((g) => ({ ...g, memberIds: [...g.memberIds], channels: [...g.channels] })));
}

export interface RecipientGroupInput {
  id?: string;
  label: string;
  description: string;
  memberIds: string[];
  channels: RecipientGroup['channels'];
}

/** Adds a group, or saves changes to one. Returns its id. */
export async function saveRecipientGroup(input: RecipientGroupInput): Promise<string> {
  const store = getStore();
  const existing = input.id ? store.recipientGroups.find((g) => g.id === input.id) : undefined;
  const id = existing?.id ?? `grp-${input.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${store.recipientGroups.length + 1}`;
  const group: RecipientGroup = { id, label: input.label, description: input.description, memberIds: input.memberIds, channels: input.channels };
  mutate((s) => {
    const i = s.recipientGroups.findIndex((g) => g.id === id);
    if (i >= 0) s.recipientGroups[i] = group;
    else s.recipientGroups.push(group);
  });
  recordAudit(
    existing ? 'Recipient group edited' : 'Recipient group added',
    `${input.label} — ${input.memberIds.length} member${input.memberIds.length === 1 ? '' : 's'} · ${input.channels.join(', ')}`,
    'recipients',
  );
  return settle(id, 220);
}

export async function removeRecipientGroup(id: string): Promise<void> {
  const group = getStore().recipientGroups.find((g) => g.id === id);
  mutate((s) => {
    s.recipientGroups = s.recipientGroups.filter((g) => g.id !== id);
  });
  recordAudit('Recipient group removed', group?.label ?? id, 'recipients');
  return settle(undefined, 220);
}
