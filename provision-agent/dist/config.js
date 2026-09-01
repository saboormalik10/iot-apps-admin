"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const required = (key) => {
    const v = process.env[key]?.trim();
    if (!v)
        throw new Error(`${key} is required`);
    return v;
};
const num = (key, fallback) => {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};
function loadConfig(argv = process.argv) {
    /**
     * ORIGIN only — `main.ts` appends `/v1/provision/…` itself.
     *
     * A trailing `/v1` is stripped rather than rejected. The ingest agent hit
     * exactly this: its install guide asked for a `/v1` suffix, which produced
     * `POST /v1/v1/…` → 404, treated as permanent, so the agent stalled silently
     * with work queued. Same shape here, so the same tolerance (M24).
     */
    const apiBaseUrl = required('OBSERVATOR_API_URL')
        .replace(/\/+$/, '')
        .replace(/\/v1$/i, '');
    if (!/^https?:\/\//.test(apiBaseUrl)) {
        throw new Error(`OBSERVATOR_API_URL must be an absolute http(s) URL, got "${apiBaseUrl}"`);
    }
    const token = required('OBSERVATOR_PROVISION_TOKEN');
    // A wrong-kind token would fail server-side anyway, but failing here names the
    // mistake instead of producing a stream of 403s.
    if (!token.startsWith('obsp_')) {
        throw new Error('OBSERVATOR_PROVISION_TOKEN must be a provisioning credential (obsp_…), not the ingest token');
    }
    return {
        apiBaseUrl,
        token,
        agentId: process.env.OBSERVATOR_AGENT_ID?.trim() || 'provision-agent',
        // 15s: provisioning is a human-initiated, rare action. Polling faster costs
        // requests all day to save a few seconds on something that happens weekly.
        pollIntervalMs: num('OBSERVATOR_POLL_MS', 15_000),
        requestTimeoutMs: num('OBSERVATOR_TIMEOUT_MS', 20_000),
        // NOTE: there is deliberately no SFTP-group or upload-root setting here.
        // sudo's `env_reset` would strip them, so an option would be a lie. They are
        // defined in the root-owned script instead.
        scriptPath: process.env.OBSERVATOR_SCRIPT?.trim() || '/opt/observator/provision-agent/deploy/provision.sh',
        dryRun: argv.includes('--dry-run'),
        once: argv.includes('--once'),
    };
}
//# sourceMappingURL=config.js.map