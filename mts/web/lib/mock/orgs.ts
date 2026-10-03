import type { Organization, OrgRight, StationInput, StationMeasure, StationRecord, User } from '@/lib/api/types';
import { now } from './clock';
import { actingUser, recordAudit } from './api';
import { OTHER_ORG_USERS, USERS } from './seed/people';
import { ORGANISATIONS, RIGHT_LABELS } from './seed/orgs';
import { STATIONS } from './seed/stations';
import { getStore, mutate } from './store';

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
  if (actingAs() === 'super-user') return true;
  return Boolean(organisationNow(orgId)?.rights[right].on);
}

export async function listOrganisations(): Promise<Organization[]> {
  const store = getStore();
  const people: User[] = [...USERS, ...OTHER_ORG_USERS, ...store.addedUsers].filter((u) => !store.removedUsers.has(u.id));
  const stations = stationRecordsNow();
  return settle(
    orgsNow().map((o) => ({
      ...o,
      userCount: people.filter((u) => (u.orgId ?? 'mts') === o.id).length,
      stationCount: stations.filter((s) => s.orgId === o.id).length,
    })),
  );
}

export async function createOrganisation(input: { name: string; code: string; region: string; adminName: string; adminEmail: string }): Promise<void> {
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
      initials: input.adminName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      roles: ['administrator'],
      stationAccess: 'all',
      orgId: id,
      status: 'invited',
    });
  });
  recordAudit('Organisation created', `${input.name} (${input.code.toUpperCase()}) — rights to add users, stations and sensors all off; ${input.adminName} invited as Administrator`, 'organisation');
  return settle(undefined, 260);
}

export async function setOrgRight(orgId: string, right: OrgRight, on: boolean): Promise<void> {
  const org = organisationNow(orgId);
  mutate((s) =>
    s.orgRightEdits.set(orgId, { ...(s.orgRightEdits.get(orgId) ?? {}), [right]: { on, by: actingUser().name, at: now() } }),
  );
  recordAudit(on ? 'Right granted' : 'Right withdrawn', `${org?.name ?? orgId} — ${RIGHT_LABELS[right].label} for its Administrator`, 'organisation');
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

export async function addStation(input: StationInput): Promise<void> {
  const org = organisationNow(input.orgId);
  const ordinal = stationRecordsNow().filter((s) => s.orgId === input.orgId).length + 1;
  mutate((s) =>
    s.addedStations.push({
      ...input,
      id: `st-added-${s.addedStations.length + 1}`,
      orgName: org?.name ?? input.orgId,
      ordinal,
      status: 'commissioning',
      createdAt: now(),
      createdBy: actingUser().name,
      added: true,
    }),
  );
  recordAudit('Station added', `${input.name} (Location ${ordinal}) — ${org?.name ?? input.orgId}, logger ${input.loggerId}. Commissioning.`, 'station');
  return settle(undefined, 240);
}
