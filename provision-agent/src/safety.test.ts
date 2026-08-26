import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { vetJob, isValidAccountName, isValidFolderSegment } from './safety';

/**
 * The agent's refusal rules.
 *
 * Provisioning is remote code execution by design. Every string here either
 * reaches a root-level command or is refused, so these cases are the difference
 * between a working feature and a shell injection.
 */

describe('isValidAccountName', () => {
  test('accepts the shapes provisioning issues', () => {
    for (const ok of ['wx-acme-01', 'wx_acme', 'abc', 'a'.repeat(32)]) {
      assert.equal(isValidAccountName(ok), true, ok);
    }
  });

  test('REFUSES anything a shell would treat as syntax', () => {
    for (const bad of [
      'wx acme', 'wx;rm -rf /', 'wx&&id', 'wx|cat', 'wx$(id)', 'wx`id`', 'wx>out', 'wx\nacme',
      '../etc/passwd', 'wx/acme', "wx'", 'wx"', 'wx\\acme', 'wx*', 'wx#c',
    ]) {
      assert.equal(isValidAccountName(bad), false, bad);
    }
  });

  test('refuses names that are not strings at all', () => {
    // A corrupted or hostile job document may carry anything.
    for (const bad of [null, undefined, 42, {}, [], true]) {
      assert.equal(isValidAccountName(bad), false, String(bad));
    }
  });

  test('refuses reserved system accounts', () => {
    for (const bad of ['root', 'sshd', 'www-data', 'nobody', 'wxstation', 'admin']) {
      assert.equal(isValidAccountName(bad), false, bad);
    }
  });

  test('refuses names that are too short, too long, or start wrong', () => {
    for (const bad of ['ab', 'a'.repeat(33), '1acme', '-acme', '_acme', 'Acme']) {
      assert.equal(isValidAccountName(bad), false, bad);
    }
  });
});

describe('isValidFolderSegment', () => {
  test('accepts a display-facing tower name', () => {
    for (const ok of ['Demo Tower', 'Tower_02-B', 'Site 3', 'A.B']) {
      assert.equal(isValidFolderSegment(ok), true, ok);
    }
  });

  test('REFUSES separators and traversal', () => {
    for (const bad of ['a/b', 'a\\b', '..', 'a/../b', '../etc', '.hidden']) {
      assert.equal(isValidFolderSegment(bad), false, bad);
    }
  });

  test('refuses untrimmed names, which produce surprising directories', () => {
    assert.equal(isValidFolderSegment(' Tower'), false);
    assert.equal(isValidFolderSegment('Tower '), false);
  });

  test('refuses shell metacharacters', () => {
    for (const bad of ['Tower;id', 'Tower$(id)', 'Tower|x', 'Tower&', 'Tower>f', 'Tower*']) {
      assert.equal(isValidFolderSegment(bad), false, bad);
    }
  });
});

describe('vetJob', () => {
  const job = (type: string, args: Record<string, unknown>) => ({ id: 'j1', type, args });

  test('accepts a well-formed account creation', () => {
    const r = vetJob(job('createStationAccount', { account: 'wx-acme-01', folder: 'Tower A' }));
    assert.deepEqual(r, { ok: true, type: 'createStationAccount', account: 'wx-acme-01', folder: 'Tower A' });
  });

  test('REFUSES a job type it does not know, rather than attempting it', () => {
    // The set of actions is fixed. A backend that queues something else — through
    // a bug or a compromise — gets a refusal, not an improvised command.
    const r = vetJob(job('runShellCommand', { account: 'wx-acme-01' }));
    assert.equal(r.ok, false);
  });

  test('refuses an injected account name even for a known type', () => {
    const r = vetJob(job('disableStationAccount', { account: 'root; rm -rf /' }));
    assert.equal(r.ok, false);
  });

  test('refuses a traversal folder even with a valid account', () => {
    const r = vetJob(job('createStationAccount', { account: 'wx-acme-01', folder: '../../etc' }));
    assert.equal(r.ok, false);
  });

  test('does not require a folder for jobs that do not use one', () => {
    const r = vetJob(job('rotateStationPassword', { account: 'wx-acme-01' }));
    assert.equal(r.ok, true);
    assert.equal((r as { folder?: string }).folder, undefined);
  });

  test('returns a refusal instead of throwing, so the job can be reported', () => {
    // Throwing would crash the agent and leave the job claimed until its lease
    // expired, then claimed again, forever.
    assert.doesNotThrow(() => vetJob(job('createStationAccount', { account: null })));
  });

  test('tolerates a job with no args at all', () => {
    assert.equal(vetJob({ id: 'j', type: 'createStationAccount', args: {} }).ok, false);
  });

  test('accepts the usage report, which needs no folder', () => {
    const r = vetJob(job('reportStationUsage', { account: 'wx-acme-01' }));
    assert.equal(r.ok, true);
  });

  test('still refuses an injected account on the usage report', () => {
    // A read-only job is still a root-level command with an argument.
    assert.equal(vetJob(job('reportStationUsage', { account: 'wx; cat /etc/shadow' })).ok, false);
  });
});
