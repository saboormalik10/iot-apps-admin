"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const safety_1 = require("./safety");
/**
 * The agent's refusal rules.
 *
 * Provisioning is remote code execution by design. Every string here either
 * reaches a root-level command or is refused, so these cases are the difference
 * between a working feature and a shell injection.
 */
(0, node_test_1.describe)('isValidAccountName', () => {
    (0, node_test_1.test)('accepts the shapes provisioning issues', () => {
        for (const ok of ['wx-acme-01', 'wx_acme', 'abc', 'a'.repeat(32)]) {
            strict_1.default.equal((0, safety_1.isValidAccountName)(ok), true, ok);
        }
    });
    (0, node_test_1.test)('REFUSES anything a shell would treat as syntax', () => {
        for (const bad of [
            'wx acme', 'wx;rm -rf /', 'wx&&id', 'wx|cat', 'wx$(id)', 'wx`id`', 'wx>out', 'wx\nacme',
            '../etc/passwd', 'wx/acme', "wx'", 'wx"', 'wx\\acme', 'wx*', 'wx#c',
        ]) {
            strict_1.default.equal((0, safety_1.isValidAccountName)(bad), false, bad);
        }
    });
    (0, node_test_1.test)('refuses names that are not strings at all', () => {
        // A corrupted or hostile job document may carry anything.
        for (const bad of [null, undefined, 42, {}, [], true]) {
            strict_1.default.equal((0, safety_1.isValidAccountName)(bad), false, String(bad));
        }
    });
    (0, node_test_1.test)('refuses reserved system accounts', () => {
        for (const bad of ['root', 'sshd', 'www-data', 'nobody', 'wxstation', 'admin']) {
            strict_1.default.equal((0, safety_1.isValidAccountName)(bad), false, bad);
        }
    });
    (0, node_test_1.test)('refuses names that are too short, too long, or start wrong', () => {
        for (const bad of ['ab', 'a'.repeat(33), '1acme', '-acme', '_acme', 'Acme']) {
            strict_1.default.equal((0, safety_1.isValidAccountName)(bad), false, bad);
        }
    });
});
(0, node_test_1.describe)('isValidFolderSegment', () => {
    (0, node_test_1.test)('accepts a display-facing tower name', () => {
        for (const ok of ['Demo Tower', 'Tower_02-B', 'Site 3', 'A.B']) {
            strict_1.default.equal((0, safety_1.isValidFolderSegment)(ok), true, ok);
        }
    });
    (0, node_test_1.test)('REFUSES separators and traversal', () => {
        for (const bad of ['a/b', 'a\\b', '..', 'a/../b', '../etc', '.hidden']) {
            strict_1.default.equal((0, safety_1.isValidFolderSegment)(bad), false, bad);
        }
    });
    (0, node_test_1.test)('refuses untrimmed names, which produce surprising directories', () => {
        strict_1.default.equal((0, safety_1.isValidFolderSegment)(' Tower'), false);
        strict_1.default.equal((0, safety_1.isValidFolderSegment)('Tower '), false);
    });
    (0, node_test_1.test)('refuses shell metacharacters', () => {
        for (const bad of ['Tower;id', 'Tower$(id)', 'Tower|x', 'Tower&', 'Tower>f', 'Tower*']) {
            strict_1.default.equal((0, safety_1.isValidFolderSegment)(bad), false, bad);
        }
    });
});
(0, node_test_1.describe)('vetJob', () => {
    const job = (type, args) => ({ id: 'j1', type, args });
    (0, node_test_1.test)('accepts a well-formed account creation', () => {
        const r = (0, safety_1.vetJob)(job('createStationAccount', { account: 'wx-acme-01', folder: 'Tower A' }));
        strict_1.default.deepEqual(r, { ok: true, type: 'createStationAccount', account: 'wx-acme-01', folder: 'Tower A' });
    });
    (0, node_test_1.test)('REFUSES a job type it does not know, rather than attempting it', () => {
        // The set of actions is fixed. A backend that queues something else — through
        // a bug or a compromise — gets a refusal, not an improvised command.
        const r = (0, safety_1.vetJob)(job('runShellCommand', { account: 'wx-acme-01' }));
        strict_1.default.equal(r.ok, false);
    });
    (0, node_test_1.test)('refuses an injected account name even for a known type', () => {
        const r = (0, safety_1.vetJob)(job('disableStationAccount', { account: 'root; rm -rf /' }));
        strict_1.default.equal(r.ok, false);
    });
    (0, node_test_1.test)('refuses a traversal folder even with a valid account', () => {
        const r = (0, safety_1.vetJob)(job('createStationAccount', { account: 'wx-acme-01', folder: '../../etc' }));
        strict_1.default.equal(r.ok, false);
    });
    (0, node_test_1.test)('does not require a folder for jobs that do not use one', () => {
        const r = (0, safety_1.vetJob)(job('rotateStationPassword', { account: 'wx-acme-01' }));
        strict_1.default.equal(r.ok, true);
        strict_1.default.equal(r.folder, undefined);
    });
    (0, node_test_1.test)('returns a refusal instead of throwing, so the job can be reported', () => {
        // Throwing would crash the agent and leave the job claimed until its lease
        // expired, then claimed again, forever.
        strict_1.default.doesNotThrow(() => (0, safety_1.vetJob)(job('createStationAccount', { account: null })));
    });
    (0, node_test_1.test)('tolerates a job with no args at all', () => {
        strict_1.default.equal((0, safety_1.vetJob)({ id: 'j', type: 'createStationAccount', args: {} }).ok, false);
    });
    (0, node_test_1.test)('accepts the usage report, which needs no folder', () => {
        const r = (0, safety_1.vetJob)(job('reportStationUsage', { account: 'wx-acme-01' }));
        strict_1.default.equal(r.ok, true);
    });
    (0, node_test_1.test)('still refuses an injected account on the usage report', () => {
        // A read-only job is still a root-level command with an argument.
        strict_1.default.equal((0, safety_1.vetJob)(job('reportStationUsage', { account: 'wx; cat /etc/shadow' })).ok, false);
    });
});
//# sourceMappingURL=safety.test.js.map