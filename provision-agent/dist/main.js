"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const safety_1 = require("./safety");
const runner_1 = require("./runner");
const log_1 = require("./log");
/**
 * Provisioning agent.
 *
 * POLLS the backend for work — it does not listen. That is the whole security
 * posture: the SFTP box exposes no inbound port for this, needs no TLS
 * certificate, and holds only an outbound-only credential. A machine that
 * accepts no connections cannot be reached.
 *
 *   1. claim   → at most one job, leased so two agents cannot run the same one
 *   2. vet     → refuse anything the agent does not recognise or trust
 *   3. run     → one root-owned helper, arguments as an array, never a shell
 *   4. report  → outcome back to the queue; a secret goes up, never to disk
 *
 * Runs in its OWN systemd unit, separate from the ingest agent, because
 * `NoNewPrivileges=true` and `sudo` are mutually exclusive — the ingest unit
 * keeps the hardening, this one gives it up for exactly one command.
 */
let stopping = false;
let consecutiveFailures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Exponential backoff, capped — a backend outage must not become a hot loop. */
const backoffMs = (failures) => Math.min(30_000 * 2 ** Math.min(failures, 4), 300_000);
async function api(cfg, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    try {
        const res = await fetch(`${cfg.apiBaseUrl}/v1/provision${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`${res.status} ${text.slice(0, 200)}`);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timer);
    }
}
async function tick(cfg) {
    const claimed = (await api(cfg, '/jobs/claim', { agentId: cfg.agentId }));
    const job = claimed?.data;
    if (!job)
        return false;
    log_1.log.info(`claimed job ${job.id} (${job.type})`);
    const vetted = (0, safety_1.vetJob)(job);
    if (!vetted.ok) {
        // Refused, not attempted — and reported, so it stops being retried and
        // becomes visible rather than silently looping.
        log_1.log.error(`REFUSED job ${job.id}: ${vetted.reason}`);
        await api(cfg, `/jobs/${job.id}/result`, { ok: false, error: `refused by agent: ${vetted.reason}` });
        return true;
    }
    // `enableIngestAgent` needs that customer's ingest token. It is collected
    // here — once, from the API — rather than carried in the job arguments, which
    // persist for 90 days and reach every backup.
    const fetchSecret = async (id) => {
        try {
            // `agentId` is REQUIRED: the server releases the secret only to the agent
            // holding a live claim on that job. It used to scope the read to the
            // credential's organisation instead, which meant every customer but the
            // one that minted the credential got "ingest token unavailable" on the
            // first attempt.
            const res = (await api(cfg, `/jobs/${id}/secret`, { agentId: cfg.agentId }));
            return res?.data?.secret ?? null;
        }
        catch (err) {
            log_1.log.error(`could not collect job secret: ${String(err)}`);
            return null;
        }
    };
    const outcome = await (0, runner_1.runJob)(cfg, vetted, job.id, fetchSecret);
    await api(cfg, `/jobs/${job.id}/result`, {
        ok: outcome.ok,
        result: outcome.result,
        error: outcome.error,
        // The secret rides the report so the operator can be shown it once. The
        // backend strips secret-shaped keys before storing the job.
        ...(outcome.secret ? { password: outcome.secret } : {}),
    });
    log_1.log.info(outcome.ok ? `job ${job.id} succeeded` : `job ${job.id} failed: ${outcome.error}`);
    return true;
}
async function main() {
    const cfg = (0, config_1.loadConfig)();
    log_1.log.info('observator-provision-agent');
    log_1.log.info(`  api      ${cfg.apiBaseUrl}`);
    log_1.log.info(`  agent    ${cfg.agentId}`);
    log_1.log.info(`  helper   ${cfg.scriptPath}`);
    if (cfg.dryRun)
        log_1.log.warn('  DRY RUN — no account will be created');
    // Startup self-check: refuse to run at all if the helper could have been
    // tampered with. Better to fail visibly now than to run something unexpected
    // with root behind it later.
    if (!cfg.dryRun)
        await (0, runner_1.assertScriptSafe)(cfg);
    const shutdown = (signal) => {
        log_1.log.info(`${signal} — finishing the current job then exiting`);
        stopping = true;
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    while (!stopping) {
        try {
            const didWork = await tick(cfg);
            consecutiveFailures = 0;
            if (cfg.once)
                break;
            // No pause after work: a queued batch drains promptly.
            if (!didWork)
                await sleep(cfg.pollIntervalMs);
        }
        catch (err) {
            consecutiveFailures += 1;
            const wait = backoffMs(consecutiveFailures);
            log_1.log.error(`poll failed (${consecutiveFailures}): ${String(err)} — retrying in ${Math.round(wait / 1000)}s`);
            if (cfg.once)
                break;
            await sleep(wait);
        }
    }
    log_1.log.info('stopped');
}
main().catch((err) => {
    log_1.log.error(String(err));
    process.exit(1);
});
//# sourceMappingURL=main.js.map