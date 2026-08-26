import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertScriptSafe, isSafeMode, isSafeOwner } from './runner';
import { AgentConfig } from './config';

/**
 * The startup self-check on the privileged helper.
 *
 * The agent runs unprivileged and calls exactly one script through sudo. If the
 * agent's own user could WRITE that script, compromising the agent would be
 * equivalent to root — sudo would happily run whatever had been substituted. So
 * ownership and mode are verified before the agent will start at all.
 *
 * These tests run as a normal user, so the root-ownership branch cannot be
 * exercised here; it is asserted on the mode bits, which is the half a
 * non-root process can create.
 */

let dir: string;
const cfg = (scriptPath: string) => ({ scriptPath }) as AgentConfig;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'provsafe-'));
});
after(async () => rm(dir, { recursive: true, force: true }));

describe('assertScriptSafe', () => {
  test('refuses to start when the helper is missing', async () => {
    // A missing helper means the deployment is incomplete. Starting anyway would
    // fail one job at a time instead of failing loudly, once.
    await assert.rejects(() => assertScriptSafe(cfg(join(dir, 'nope.sh'))), /not found/i);
  });

  test('refuses a path that is a directory, not a file', async () => {
    const d = join(dir, 'adir');
    await mkdir(d, { recursive: true });
    await assert.rejects(() => assertScriptSafe(cfg(d)), /not a file/i);
  });

  test('rejects a helper that is NOT root-owned, whatever its mode', async () => {
    // 0500 alone proves nothing: a file the agent owns can be chmod'd back by
    // the agent. Ownership is the part that cannot be undone from inside.
    const p = join(dir, 'mine.sh');
    await writeFile(p, '#!/bin/sh\n');
    await chmod(p, 0o500);
    await assert.rejects(() => assertScriptSafe(cfg(p)), /owned by root/i);
  });
});

describe('isSafeMode', () => {
  // Tested directly because the ownership check necessarily fires first, which
  // makes this branch unreachable from `assertScriptSafe` for a non-root test.
  test('accepts modes only root can write', () => {
    for (const ok of [0o500, 0o550, 0o555, 0o700, 0o755]) {
      assert.equal(isSafeMode(ok), true, ok.toString(8));
    }
  });

  test('REFUSES group-writable', () => {
    for (const bad of [0o520, 0o570, 0o770]) assert.equal(isSafeMode(bad), false, bad.toString(8));
  });

  test('REFUSES world-writable', () => {
    for (const bad of [0o502, 0o507, 0o777, 0o666]) assert.equal(isSafeMode(bad), false, bad.toString(8));
  });

  test('the intended deployment mode passes', () => {
    assert.equal(isSafeMode(0o500), true);
  });
});

describe('isSafeOwner', () => {
  test('only uid 0', () => {
    assert.equal(isSafeOwner(0), true);
    for (const bad of [1, 1000, 65534]) assert.equal(isSafeOwner(bad), false, String(bad));
  });
});
