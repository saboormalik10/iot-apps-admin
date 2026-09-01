"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOLDER_CASES = exports.ACCOUNT_CASES = void 0;
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const safety_1 = require("./safety");
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
exports.ACCOUNT_CASES = [
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
exports.FOLDER_CASES = [
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
(0, node_test_1.describe)('cross-layer: account names', () => {
    for (const [name, expected] of exports.ACCOUNT_CASES) {
        (0, node_test_1.test)(`${JSON.stringify(name)} → ${expected ? 'accept' : 'refuse'}`, () => {
            strict_1.default.equal((0, safety_1.isValidAccountName)(name), expected);
        });
    }
});
(0, node_test_1.describe)('cross-layer: folder segments', () => {
    for (const [name, expected] of exports.FOLDER_CASES) {
        (0, node_test_1.test)(`${JSON.stringify(name)} → ${expected ? 'accept' : 'refuse'}`, () => {
            strict_1.default.equal((0, safety_1.isValidFolderSegment)(name), expected);
        });
    }
});
//# sourceMappingURL=cross-layer.test.js.map