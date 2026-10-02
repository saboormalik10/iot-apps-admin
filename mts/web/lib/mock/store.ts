import type { AlertEvent, AlertRule, Annotation, AuditEntry, ControlMode, PumpState, Role, RoleId, RuleVersion, User } from '@/lib/api/types';

/**
 * The prototype's entire mutable surface.
 *
 * Module scope, not React state, so an alert acknowledged on the alerts screen is
 * still acknowledged when you reach the corridor map — client navigation does not
 * re-evaluate modules. A hard reload does, which is exactly the reset we want:
 * nothing is persisted, so the demo always opens in the same state.
 *
 * Deliberately no localStorage. A prototype that remembers what the last person
 * did starts the next demo in the wrong place.
 *
 * If this list grows much beyond what is here, the prototype is drifting into
 * being an application.
 */

export interface PumpRuntime {
  mode: ControlMode;
  state: PumpState;
  /** Set when a command was issued in this session, so the UI can show it as simulated. */
  lastCommand?: { action: 'start' | 'stop'; at: number; by: string };
}

interface Store {
  acknowledged: Map<string, { by: string; at: number }>;
  injectedEvents: AlertEvent[];
  pumps: Map<string, PumpRuntime>;
  ruleEnabled: Map<string, boolean>;
  ruleEdits: Map<string, Record<string, unknown>>;
  /** Rules added in this session, so "New rule" is a real control, not a stub. */
  addedRules: AlertRule[];
  /** Instruments added from Admin → Sensors in this session. */
  addedInstruments: import('@/lib/api/types').Instrument[];
  /** Edits to any instrument — serial after a like-for-like swap, status, notes. */
  instrumentEdits: Map<string, Partial<import('@/lib/api/types').Instrument>>;
  /** Rule-set versions published in this session (v8, v9, …), newest first. */
  ruleVersions: RuleVersion[];
  /** Roles created from the roles screen — §8.4 promises custom roles. */
  addedRoles: Role[];
  /** Notes controllers add to an event — §8.1 "interrogate, annotate and acknowledge". */
  annotations: Annotation[];
  /** Locations a technician has put into maintenance mode (§8.4). */
  maintenance: Map<string, { by: string; since: number; reason: string } | null>;
  /** Everything done in this session, for the audit trail. */
  audit: AuditEntry[];
  userEdits: Map<string, Record<string, unknown>>;
  addedUsers: User[];
  removedUsers: Set<string>;
  /** Which roles the viewer appears to hold — the demo dock's "view as". */
  viewerRoles: RoleId[] | null;
  /** Bumped on every mutation so React Query can be invalidated cheaply. */
  revision: number;
}

function initial(): Store {
  return {
    acknowledged: new Map(),
    injectedEvents: [],
    pumps: new Map([
      ['MKV-PUMP-DUTY', { mode: 'auto', state: 'running' }],
      ['MKV-PUMP-STANDBY', { mode: 'auto', state: 'ready' }],
    ]),
    ruleEnabled: new Map(),
    ruleEdits: new Map(),
    addedRules: [],
    ruleVersions: [],
    addedInstruments: [],
    instrumentEdits: new Map(),
    addedRoles: [],
    annotations: [],
    maintenance: new Map(),
    audit: [],
    userEdits: new Map(),
    addedUsers: [],
    removedUsers: new Set(),
    viewerRoles: null,
    revision: 0,
  };
}

let store: Store = initial();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToData(fn: Listener): () => void {
  return subscribe(fn);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStore(): Readonly<Store> {
  return store;
}

/** The only way to change anything. Bumps the revision and notifies subscribers. */
export function mutate(fn: (s: Store) => void): void {
  fn(store);
  store.revision += 1;
  listeners.forEach((l) => l());
}

export function resetStore(): void {
  store = initial();
  listeners.forEach((l) => l());
}

export function getRevision(): number {
  return store.revision;
}
