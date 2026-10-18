/**
 * Alerts are off on site PCs (client, 10 Oct 2026). The suites that exercise the
 * rules engine run with it on, as a site that turns it back on would.
 * `alerts-switch.e2e-spec.ts` covers the default.
 */
process.env.ALERTS_ENABLED ??= 'true';
