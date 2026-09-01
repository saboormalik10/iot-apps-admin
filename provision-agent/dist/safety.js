"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_JOB_TYPES = exports.FOLDER_SEGMENT_RE = exports.ACCOUNT_RE = void 0;
exports.isValidAccountName = isValidAccountName;
exports.isValidFolderSegment = isValidFolderSegment;
exports.vetJob = vetJob;
exports.ACCOUNT_RE = /^[a-z][a-z0-9_-]{2,31}$/;
const RESERVED = new Set([
    'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news',
    'uucp', 'proxy', 'www-data', 'backup', 'list', 'irc', 'gnats', 'nobody',
    'systemd', 'sshd', 'ubuntu', 'admin', 'administrator', 'ftp', 'sftp',
    'observator', 'wxstation',
]);
exports.FOLDER_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;
function isValidAccountName(name) {
    return typeof name === 'string' && exports.ACCOUNT_RE.test(name) && !RESERVED.has(name);
}
function isValidFolderSegment(segment) {
    return (typeof segment === 'string' &&
        exports.FOLDER_SEGMENT_RE.test(segment) &&
        !segment.includes('..') &&
        segment.trim() === segment);
}
/** Every job the agent knows how to do. Anything else is refused, not attempted. */
exports.KNOWN_JOB_TYPES = [
    'createStationAccount',
    'rotateStationPassword',
    'disableStationAccount',
    'createStationFolder',
    'reportStationUsage',
];
/**
 * Decide whether a job is safe to run, and normalise its arguments.
 *
 * Returns a REFUSAL rather than throwing, so the agent reports a clear error
 * back to the queue instead of crashing and leaving the job claimed.
 */
function vetJob(job) {
    if (!exports.KNOWN_JOB_TYPES.includes(job.type)) {
        return { ok: false, reason: `unknown job type "${job.type}"` };
    }
    const type = job.type;
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
//# sourceMappingURL=safety.js.map