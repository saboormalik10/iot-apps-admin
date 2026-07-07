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

// Backend paths (relative to /v1) the typed client depends on — kept in lockstep
// with lib/api/endpoints.ts. Verified against the live Admin spec when available.
const CLIENT_ENDPOINTS = [
  { method: 'post', path: '/auth/login' },
  { method: 'post', path: '/auth/refresh' },
  { method: 'post', path: '/auth/logout' },
  { method: 'post', path: '/auth/forgot-password' },
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
  const b = await checkSwagger();
  process.exit(a && b ? 0 : 1);
})();
