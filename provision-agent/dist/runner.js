"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSafeMode = isSafeMode;
exports.isSafeOwner = isSafeOwner;
exports.assertScriptSafe = assertScriptSafe;
exports.runJob = runJob;
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const util_1 = require("util");
const log_1 = require("./log");
const run = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Run a command, optionally writing something to its stdin.
 *
 * `promisify(execFile)` has no `input` option — that belongs to the SYNCHRONOUS
 * variant, and passing it there is silently ignored, which would have sent the
 * helper an empty token and written an unusable env file. So the child's stdin
 * is written explicitly here.
 */
function runWithInput(cmd, args, opts, input) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.execFile)(cmd, args, opts, (err, stdout, stderr) => {
            if (err) {
                Object.assign(err, { stderr });
                reject(err);
            }
            else {
                resolve({ stdout: String(stdout) });
            }
        });
        child.stdin?.end(input);
    });
}
/**
 * Refuse to start unless the privileged helper is safe to invoke.
 *
 * The agent runs unprivileged and calls this one script through sudo. If the
 * agent's own user could WRITE that script, then compromising the agent would
 * be equivalent to root — the sudo rule would happily run whatever had been
 * substituted. So ownership and mode are checked at startup, loudly, rather than
 * assumed by whoever wrote the deployment notes.
 */
/**
 * True if only root can write this mode.
 *
 * Split out from `assertScriptSafe` so it can actually be TESTED: the ownership
 * check necessarily fires first, which makes the mode branch unreachable for any
 * test not running as root. A safety check nobody can exercise is one being
 * taken on trust.
 */
function isSafeMode(mode) {
    return (mode & 0o022) === 0;
}
/** Only root may own the helper — see `assertScriptSafe`. */
function isSafeOwner(uid) {
    return uid === 0;
}
async function assertScriptSafe(cfg) {
    const st = await (0, promises_1.stat)(cfg.scriptPath).catch(() => null);
    if (!st)
        throw new Error(`provisioning helper not found at ${cfg.scriptPath}`);
    if (!st.isFile())
        throw new Error(`${cfg.scriptPath} is not a file`);
    const mode = st.mode & 0o777;
    // Ownership first: a file the agent owns can be chmod'd back by the agent, so
    // a correct mode on an agent-owned file proves nothing.
    if (!isSafeOwner(st.uid)) {
        throw new Error(`${cfg.scriptPath} must be owned by root (uid 0), found uid ${st.uid}`);
    }
    // Group- or world-writable means someone other than root can change what sudo
    // executes. 0500 (r-x------) is the intended mode.
    if (!isSafeMode(mode)) {
        throw new Error(`${cfg.scriptPath} is writable by group or others (mode ${mode.toString(8)}); expected 0500`);
    }
    log_1.log.info(`helper ${cfg.scriptPath} verified (uid ${st.uid}, mode ${mode.toString(8)})`);
}
/**
 * Execute one vetted job.
 *
 * `execFile`, never `exec` — arguments are passed as an ARRAY and never
 * interpolated into a shell string, so even if validation were somehow bypassed
 * there is no shell to inject into. The job type maps to a subcommand the script
 * recognises; the agent never forwards a command of its own.
 */
async function runJob(cfg, job, jobId, fetchSecret) {
    const argv = [cfg.scriptPath, job.type, job.account];
    if (job.folder)
        argv.push(job.folder);
    /**
     * `enableIngestAgent` needs that customer's ingest token on the box.
     *
     * It is collected here and passed to the helper on STDIN — never as an
     * argument. Arguments are visible to every user on the machine through `ps`,
     * and this box also terminates untrusted SFTP logins, so an argv-borne
     * credential would be readable by the very accounts it is meant to isolate.
     */
    let stdinSecret;
    if (job.type === 'enableIngestAgent') {
        if (!fetchSecret || !jobId)
            return { ok: false, error: 'no secret channel available for enableIngestAgent' };
        const secret = await fetchSecret(jobId);
        if (!secret)
            return { ok: false, error: 'ingest token unavailable (already collected or expired)' };
        stdinSecret = secret;
    }
    if (cfg.dryRun) {
        log_1.log.warn(`[dry-run] would run: sudo -n ${argv.join(' ')}`);
        return { ok: true, result: { dryRun: true, type: job.type, account: job.account } };
    }
    try {
        // NO CUSTOM ENV. `sudo` runs with `env_reset` by default, so anything set
        // here is stripped before the script sees it — passing OBSERVATOR_SFTP_GROUP
        // and OBSERVATOR_UPLOAD_ROOT looked like configuration and silently did
        // nothing. Worse than useless: a deployment that set a different group would
        // create accounts in the wrong one and break the sshd chroot, with no error.
        //
        // Those values now live in the root-owned script, which is the only place
        // they can be both trusted and effective. `PATH` is set for this process's
        // own lookup of `sudo`; sudo applies its own `secure_path` beyond that.
        const opts = {
            timeout: 60_000,
            maxBuffer: 1024 * 256,
            env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' },
        };
        const { stdout } = stdinSecret !== undefined
            ? await runWithInput('sudo', ['-n', ...argv], opts, `${stdinSecret}\n`)
            : await run('sudo', ['-n', ...argv], opts);
        // The script prints one JSON object. Anything else is a bug in the script,
        // and guessing at unstructured output is how a failure gets read as success.
        const trimmed = stdout.trim();
        let parsed;
        try {
            parsed = JSON.parse(trimmed.slice(trimmed.lastIndexOf('{')));
        }
        catch {
            return { ok: false, error: `helper produced unparseable output: ${trimmed.slice(0, 200)}` };
        }
        // A generated password travels UP to the operator and is never stored or
        // logged; the backend strips secret-shaped keys as a second line of defence.
        const secret = typeof parsed.password === 'string' ? parsed.password : undefined;
        delete parsed.password;
        return { ok: parsed.ok !== false, result: parsed, secret };
    }
    catch (err) {
        const e = err;
        // stderr, not stdout — and truncated, because a helper failure can be verbose.
        return { ok: false, error: (e.stderr || e.message || 'helper failed').toString().slice(0, 500) };
    }
}
//# sourceMappingURL=runner.js.map