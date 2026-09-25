#!/usr/bin/env node
/**
 * Runs Lighthouse CI against the authenticated app (plan §Month 12).
 *
 * Wraps `lhci autorun` with a real BFF session cookie so the budget covers the
 * dashboard/devices/sessions routes, not just /login. `/login` stays in the URL
 * list — a session cookie doesn't stop it rendering, and it's the only route a
 * signed-out visitor sees.
 */
import { execFileSync } from 'node:child_process';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', ...opts });

let cookie = '';
try {
  cookie = execFileSync('node', ['scripts/lighthouse-session.mjs'], { encoding: 'utf8' }).trim();
} catch {
  console.error('Could not mint a session cookie — is admin-web running with a seeded backend?');
  process.exit(1);
}

console.log(`• Authenticated as ${process.env.SEED_ADMIN_EMAIL ?? 'admin@observator.com'}`);

try {
  run('npx', [
    '--yes',
    '@lhci/cli@0.14.0',
    'autorun',
    `--collect.settings.extraHeaders=${JSON.stringify({ Cookie: cookie })}`,
  ]);
} catch {
  process.exit(1);
}
