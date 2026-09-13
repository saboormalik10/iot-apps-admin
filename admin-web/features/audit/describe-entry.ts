import type { AuditEntry } from '@/lib/api/types';

/**
 * Turn a stored audit row into something a person can read at a glance.
 *
 * The log held `create` / `alertRule` / `shareToken` in separate columns, which
 * is how it is stored and not how anyone reads it. Someone scanning for "who
 * deleted that station" should not have to assemble the sentence themselves, or
 * know that `device` means station and `shareToken` means share link.
 *
 * Pure and exported so the wording is tested directly — rendering a table and
 * reading text out of it proves far less about the mapping.
 */

export type Tone = 'created' | 'changed' | 'removed' | 'quiet';

/** Plural-safe, human names for the things we log. Keys are what the API sends. */
const RESOURCE_LABELS: Record<string, string> = {
  device: 'station',
  station: 'station',
  user: 'person',
  role: 'role',
  alertRule: 'alert rule',
  shareToken: 'share link',
  record: 'record',
  metRecord: 'record',
  session: 'session',
  nepSession: 'session',
  organization: 'organisation settings',
  settings: 'settings',
};

/**
 * Verb per action, and how strongly to colour it.
 *
 * `login` and `logout` are deliberately quiet: they are by far the most common
 * rows (2,386 of 6,685 here), and colouring them would drown out the writes
 * somebody is actually looking for.
 */
const ACTION_VERBS: Record<string, { verb: string; tone: Tone }> = {
  create: { verb: 'Added', tone: 'created' },
  update: { verb: 'Changed', tone: 'changed' },
  delete: { verb: 'Deleted', tone: 'removed' },
  invite: { verb: 'Invited', tone: 'created' },
  revoke: { verb: 'Revoked', tone: 'removed' },
  export: { verb: 'Exported', tone: 'quiet' },
  login: { verb: 'Signed in', tone: 'quiet' },
  logout: { verb: 'Signed out', tone: 'quiet' },
};

export interface Described {
  /** The whole sentence, e.g. "Deleted the station Demo Tower". */
  text: string;
  /** The named thing, so the UI can weight it differently from the verb. */
  name: string | null;
  tone: Tone;
}

export function describeEntry(entry: Pick<AuditEntry, 'action' | 'resourceType' | 'resourceName'>): Described {
  const action = ACTION_VERBS[entry.action] ?? { verb: entry.action, tone: 'quiet' as Tone };
  const name = entry.resourceName?.trim() || null;

  // Sign-in and sign-out have no object — "Signed in the person" is nonsense.
  if (entry.action === 'login' || entry.action === 'logout') {
    return { text: action.verb, name: null, tone: action.tone };
  }

  // An unmapped resource falls back to its raw key rather than vanishing: a new
  // resource type should look unpolished, never invisible.
  const noun = RESOURCE_LABELS[entry.resourceType] ?? entry.resourceType;

  return {
    text: name ? `${action.verb} the ${noun}` : `${action.verb} a ${noun}`,
    name,
    tone: action.tone,
  };
}

/** Tailwind classes per tone — one place, so the table and any future view agree. */
export const TONE_CLASS: Record<Tone, string> = {
  created: 'bg-status-ok/10 text-status-ok',
  changed: 'bg-status-warn/10 text-status-warn',
  removed: 'bg-status-error/10 text-status-error',
  quiet: 'bg-muted text-muted-foreground',
};
