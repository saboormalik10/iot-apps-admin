#!/usr/bin/env node
/**
 * Contract-drift check (plan §3.2, §12). Two parts:
 *
 *  1. ClientEvent mirror (always, offline): the socket event names in
 *     admin-web/lib/realtime/events.ts must EXACTLY match the backend's
 *     backend/src/realtime/realtime.events.ts. A wrong string silently receives
 *     nothing at runtime, so this drift must fail the build.
 *
 *  2. Swagger ↔ client endpoints (optional, when SWAGGER_SPEC_URL is set): every
 *     backend path the typed client depends on must exist in the live Admin spec.
 *     Skipped with a notice when no spec URL is reachable (e.g. the fast gate job).
 *
 * Exits non-zero on drift.
 */
const fs = require('fs');
const path = require('path');

function parseClientEvent(source) {
  const start = source.indexOf('ClientEvent');
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const block = source.slice(open + 1, close);
  const map = {};
  const re = /([A-Z0-9_]+)\s*:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) map[m[1]] = m[2];
  return map;
}

function checkClientEventMirror() {
  const backendPath = path.join(__dirname, '..', '..', 'backend', 'src', 'realtime', 'realtime.events.ts');
  const clientPath = path.join(__dirname, '..', 'lib', 'realtime', 'events.ts');

  if (!fs.existsSync(backendPath)) {
    console.log('• ClientEvent mirror: backend source not present — skipping (frontend-only checkout).');
    return true;
  }

  const backend = parseClientEvent(fs.readFileSync(backendPath, 'utf8'));
  const client = parseClientEvent(fs.readFileSync(clientPath, 'utf8'));

  const problems = [];
  for (const [key, value] of Object.entries(backend)) {
    if (!(key in client)) problems.push(`  missing ClientEvent.${key} in admin-web`);
    else if (client[key] !== value)
      problems.push(`  ClientEvent.${key}: backend '${value}' ≠ admin-web '${client[key]}'`);
  }
  for (const key of Object.keys(client)) {
    if (!(key in backend)) problems.push(`  extra ClientEvent.${key} in admin-web (not on backend)`);
  }

  if (problems.length) {
    console.error('✗ ClientEvent drift vs backend/src/realtime/realtime.events.ts:');
    problems.forEach((p) => console.error(p));
    return false;
  }
  console.log(`✓ ClientEvent mirror OK (${Object.keys(backend).length} events match the backend).`);
  return true;
}

// ── Scales mirror (§10.9): scales.ts enumerations must match analytics.util.ts ──

/** Slice a `const NAME … <terminator>` block out of a TS source. */
function sliceConst(source, name, terminator) {
  const start = source.indexOf(`const ${name}`);
  if (start === -1) return '';
  const end = source.indexOf(terminator, start);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}
const labelsIn = (block) => (block.match(/label:\s*'([^']+)'/g) || []).map((s) => s.replace(/label:\s*'|'/g, ''));
const keysIn = (block) => (block.match(/'([0-9a-z]+)'\s*:/g) || []).map((s) => s.replace(/'|\s*:/g, ''));

function checkScalesMirror() {
  const backendPath = path.join(__dirname, '..', '..', 'backend', 'src', 'analytics', 'analytics.util.ts');
  const clientPath = path.join(__dirname, '..', 'lib', 'api', 'scales.ts');
  if (!fs.existsSync(backendPath)) {
    console.log('• Scales mirror: backend source not present — skipping (frontend-only checkout).');
    return true;
  }
  const be = fs.readFileSync(backendPath, 'utf8');
  const fe = fs.readFileSync(clientPath, 'utf8');

  const checks = [
    ['SPEED_BANDS', labelsIn(sliceConst(be, 'SPEED_BANDS', '];')), labelsIn(sliceConst(fe, 'WIND_SPEED_BANDS', '];'))],
    ['BEAUFORT', labelsIn(sliceConst(be, 'BEAUFORT', '];')), labelsIn(sliceConst(fe, 'BEAUFORT', '];'))],
    ['NTU_CLASSES', labelsIn(sliceConst(be, 'NTU_CLASSES', '];')), labelsIn(sliceConst(fe, 'NTU_CLASSES', '];'))],
    ['INTERVAL_MS', keysIn(sliceConst(be, 'INTERVAL_MS', '};')), keysIn(sliceConst(fe, 'INTERVAL_MS', '};'))],
  ];
  const problems = [];
  for (const [name, beVals, feVals] of checks) {
    if (beVals.join('|') !== feVals.join('|')) {
      problems.push(`  ${name}: backend [${beVals.join(', ')}] ≠ scales.ts [${feVals.join(', ')}]`);
    }
  }
  if (problems.length) {
    console.error('✗ scales.ts drift vs backend/src/analytics/analytics.util.ts:');
    problems.forEach((p) => console.error(p));
    return false;
  }
  console.log(`✓ Scales mirror OK (${checks.length} scales match analytics.util.ts).`);
  return true;
}

// Backend paths (relative to /v1) the typed client depends on — kept in lockstep
// with lib/api/endpoints.ts. Verified against the live Admin spec when available.
const CLIENT_ENDPOINTS = [
  { method: 'post', path: '/auth/login' },
  { method: 'post', path: '/auth/refresh' },
  { method: 'post', path: '/auth/logout' },
  { method: 'post', path: '/auth/forgot-password' },
  { method: 'post', path: '/auth/verify-reset-code' },
  { method: 'post', path: '/auth/reset-password' },
  { method: 'post', path: '/auth/ws-ticket' },
  { method: 'post', path: '/organizations/accept-invite' },
  { method: 'get', path: '/organizations/me' },
  { method: 'patch', path: '/organizations/me' },
  { method: 'get', path: '/organizations/me/users' },
  { method: 'post', path: '/organizations/me/users/invite' },
  { method: 'patch', path: '/organizations/me/users/{id}' },
  { method: 'get', path: '/audit' },
  { method: 'get', path: '/users/me' },
  { method: 'patch', path: '/users/me' },
  { method: 'get', path: '/notifications' },
  // ── Month 8: dashboard + devices ──
  { method: 'get', path: '/dashboard/summary' },
  { method: 'get', path: '/dashboard/devices' },
  { method: 'get', path: '/dashboard/met/latest' },
  { method: 'get', path: '/dashboard/met/windrose' },
  { method: 'get', path: '/dashboard/met/history' },
  { method: 'get', path: '/dashboard/nep/latest' },
  { method: 'get', path: '/dashboard/org/device-map' },
  { method: 'get', path: '/devices' },
  { method: 'post', path: '/devices' },
  { method: 'get', path: '/devices/{id}' },
  { method: 'patch', path: '/devices/{id}' },
  { method: 'delete', path: '/devices/{id}' },
  { method: 'get', path: '/devices/{id}/stats' },
  { method: 'get', path: '/devices/{id}/health' },
  { method: 'get', path: '/devices/{id}/firmware-history' },
  { method: 'get', path: '/devices/{id}/settings' },
  { method: 'patch', path: '/devices/{id}/settings' },
  { method: 'get', path: '/devices/firmware-target' },
  { method: 'put', path: '/devices/firmware-target' },
  { method: 'get', path: '/devices/firmware-status' },
  // ── Month 10: NEP analytics, maps, sessions, org rollups ──
  { method: 'get', path: '/analytics/nep/turbidity-distribution' },
  { method: 'get', path: '/analytics/nep/session-comparison' },
  { method: 'get', path: '/analytics/nep/water-quality-summary' },
  { method: 'get', path: '/analytics/nep/probe-range-breakdown' },
  { method: 'get', path: '/analytics/nep/turbidity-temperature-correlation' },
  { method: 'get', path: '/analytics/nep/session-events' },
  { method: 'get', path: '/analytics/nep/gps-density' },
  { method: 'get', path: '/analytics/nep/daily-summary' },
  { method: 'get', path: '/analytics/org/device-comparison' },
  { method: 'get', path: '/analytics/org/fleet-health' },
  { method: 'get', path: '/dashboard/nep/sessions' },
  { method: 'get', path: '/dashboard/nep/analytics' },
  { method: 'get', path: '/dashboard/nep/map' },
  { method: 'get', path: '/sessions/{id}' },
  { method: 'patch', path: '/sessions/{id}' },
  { method: 'get', path: '/sessions/{id}/samples' },
  { method: 'get', path: '/sessions/{id}/export.csv' },
  { method: 'get', path: '/sessions/{id}/files' },
  { method: 'delete', path: '/sessions/{id}/files/{fileId}' },
  // ── Month 11: alerts, notifications feed/tokens, share, public, presets ──
  { method: 'get', path: '/alert-rules' },
  { method: 'post', path: '/alert-rules' },
  { method: 'get', path: '/alert-rules/{id}' },
  { method: 'patch', path: '/alert-rules/{id}' },
  { method: 'delete', path: '/alert-rules/{id}' },
  { method: 'patch', path: '/notifications/{id}/read' },
  { method: 'post', path: '/notifications/read-all' },
  { method: 'get', path: '/notifications/tokens' },
  { method: 'post', path: '/share' },
  { method: 'get', path: '/share' },
  { method: 'delete', path: '/share/{id}' },
  { method: 'get', path: '/public/{token}' },
  { method: 'get', path: '/dashboard-layouts' },
  { method: 'post', path: '/dashboard-layouts' },
  { method: 'patch', path: '/dashboard-layouts/{id}' },
  { method: 'delete', path: '/dashboard-layouts/{id}' },
  { method: 'patch', path: '/dashboard-layouts/{id}/set-default' },
  // ── Month 12: import wizard + batch export ──
  { method: 'post', path: '/import/nep' },
  { method: 'post', path: '/import/met' },
  { method: 'get', path: '/export/sessions.zip' },
];

async function checkSwagger() {
  const url = process.env.SWAGGER_SPEC_URL;
  if (!url) {
    console.log('• Swagger check: SWAGGER_SPEC_URL not set — skipping live spec verification.');
    return true;
  }
  const user = process.env.SWAGGER_USER;
  const pass = process.env.SWAGGER_PASSWORD;
  const headers = user && pass ? { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` } : {};

  let spec;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = await res.json();
  } catch (err) {
    console.error(`✗ Swagger check: could not fetch spec (${err.message}).`);
    return false;
  }

  const paths = spec.paths ?? {};
  const norm = (p) => `/v1${p}`.replace(/\/$/, '');
  const problems = [];
  for (const ep of CLIENT_ENDPOINTS) {
    const specPath = paths[norm(ep.path)] ?? paths[ep.path];
    if (!specPath || !specPath[ep.method]) {
      problems.push(`  ${ep.method.toUpperCase()} ${ep.path} not found in spec`);
    }
  }
  if (problems.length) {
    console.error('✗ Client endpoints missing from the Admin OpenAPI spec:');
    problems.forEach((p) => console.error(p));
    return false;
  }
  console.log(`✓ Swagger contract OK (${CLIENT_ENDPOINTS.length} client endpoints present in the spec).`);
  return true;
}

(async () => {
  const a = checkClientEventMirror();
  const s = checkScalesMirror();
  const b = await checkSwagger();
  process.exit(a && s && b ? 0 : 1);
})();
