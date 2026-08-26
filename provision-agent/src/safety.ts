/**
 * The agent's own copy of the validation rules.
 *
 * DELIBERATELY DUPLICATED from the backend. This is the last line before a
 * string reaches `useradd`, and the agent must not trust the queue: a
 * compromised backend, a corrupted document, or a future bug that skips the API
 * layer all arrive here looking identical to legitimate work. Three independent
 * checks means no single failure is sufficient.
 *
 * `src/safety.test.ts` pins these to the same table the backend uses.
 */

export const ACCOUNT_RE = /^[a-z][a-z0-9_-]{2,31}$/;

const RESERVED = new Set([
  'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news',
  'uucp', 'proxy', 'www-data', 'backup', 'list', 'irc', 'gnats', 'nobody',
  'systemd', 'sshd', 'ubuntu', 'admin', 'administrator', 'ftp', 'sftp',
  'observator', 'wxstation',
]);

export const FOLDER_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;

export function isValidAccountName(name: unknown): name is string {
  return typeof name === 'string' && ACCOUNT_RE.test(name) && !RESERVED.has(name);
}

export function isValidFolderSegment(segment: unknown): segment is string {
  return (
    typeof segment === 'string' &&
    FOLDER_SEGMENT_RE.test(segment) &&
    !segment.includes('..') &&
    segment.trim() === segment
  );
}

/** Every job the agent knows how to do. Anything else is refused, not attempted. */
export const KNOWN_JOB_TYPES = [
  'createStationAccount',
  'rotateStationPassword',
  'disableStationAccount',
  'createStationFolder',
  'reportStationUsage',
] as const;

export type JobType = (typeof KNOWN_JOB_TYPES)[number];

export interface Job {
  id: string;
  type: string;
  args: Record<string, unknown>;
}

export interface Refusal {
  ok: false;
  reason: string;
}

export interface Accepted {
  ok: true;
  type: JobType;
  account: string;
  folder?: string;
}

/**
 * Decide whether a job is safe to run, and normalise its arguments.
 *
 * Returns a REFUSAL rather than throwing, so the agent reports a clear error
 * back to the queue instead of crashing and leaving the job claimed.
 */
export function vetJob(job: Job): Accepted | Refusal {
  if (!KNOWN_JOB_TYPES.includes(job.type as JobType)) {
    return { ok: false, reason: `unknown job type "${job.type}"` };
  }
  const type = job.type as JobType;
  const args = job.args ?? {};

  if (!isValidAccountName(args.account)) {
    return { ok: false, reason: `invalid account name ${JSON.stringify(args.account)}` };
  }

  if (type === 'createStationAccount' || type === 'createStationFolder') {
    if (!isValidFolderSegment(args.folder)) {
      return { ok: false, reason: `invalid folder name ${JSON.stringify(args.folder)}` };
    }
    return { ok: true, type, account: args.account, folder: args.folder };
  }

  return { ok: true, type, account: args.account };
}
