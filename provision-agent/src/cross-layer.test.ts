import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isValidAccountName, isValidFolderSegment } from './safety';

/**
 * CROSS-LAYER CONTRACT (M21 W4 security review).
 *
 * The same corpus is asserted in `backend/test/provision.e2e-spec.ts`. Three
 * layers validate provisioning arguments — the API, the queue, and this agent
 * before it invokes root — and they are only defence in depth if they AGREE.
 *
 * A divergence is a finding either way round:
 *   * outer stricter than inner → a legitimate name is rejected confusingly;
 *   * inner stricter than outer → a job queues, then fails at the agent forever;
 *   * inner LOOSER than outer → the outer check was the only thing stopping it.
 *
 * If this table is edited, edit it in both places.
 */

export const ACCOUNT_CASES: [string, boolean][] = [
  ['wx-acme-01', true],
  ['wx_acme', true],
  ['abc', true],
  ['a'.repeat(32), true],
  ['ab', false],
  ['a'.repeat(33), false],
  ['1acme', false],
  ['-acme', false],
  ['Acme', false],
  ['root', false],
  ['sshd', false],
  ['wxstation', false],
  ['wx acme', false],
  ['wx;rm -rf /', false],
  ['wx&&id', false],
  ['wx|cat', false],
  ['wx$(id)', false],
  ['wx`id`', false],
  ['wx>out', false],
  ['wx/acme', false],
  ['../etc/passwd', false],
  ['wx\nacme', false],
  ['wx\0acme', false],
];

export const FOLDER_CASES: [string, boolean][] = [
  ['Demo Tower', true],
  ['Tower_02-B', true],
  ['Site 3', true],
  ['A.B', true],
  ['a/b', false],
  ['a\\b', false],
  ['..', false],
  ['a/../b', false],
  ['.hidden', false],
  [' Tower', false],
  ['Tower ', false],
  ['Tower;id', false],
  ['Tower$(id)', false],
  ['Tower|x', false],
  ['Tower&', false],
  ['-rf', false],
  ['', false],
];

describe('cross-layer: account names', () => {
  for (const [name, expected] of ACCOUNT_CASES) {
    test(`${JSON.stringify(name)} → ${expected ? 'accept' : 'refuse'}`, () => {
      assert.equal(isValidAccountName(name), expected);
    });
  }
});

describe('cross-layer: folder segments', () => {
  for (const [name, expected] of FOLDER_CASES) {
    test(`${JSON.stringify(name)} → ${expected ? 'accept' : 'refuse'}`, () => {
      assert.equal(isValidFolderSegment(name), expected);
    });
  }
});
