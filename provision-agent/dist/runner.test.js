"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const runner_1 = require("./runner");
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
let dir;
const cfg = (scriptPath) => ({ scriptPath });
(0, node_test_1.before)(async () => {
    dir = await (0, promises_1.mkdtemp)((0, path_1.join)((0, os_1.tmpdir)(), 'provsafe-'));
});
(0, node_test_1.after)(async () => (0, promises_1.rm)(dir, { recursive: true, force: true }));
(0, node_test_1.describe)('assertScriptSafe', () => {
    (0, node_test_1.test)('refuses to start when the helper is missing', async () => {
        // A missing helper means the deployment is incomplete. Starting anyway would
        // fail one job at a time instead of failing loudly, once.
        await strict_1.default.rejects(() => (0, runner_1.assertScriptSafe)(cfg((0, path_1.join)(dir, 'nope.sh'))), /not found/i);
    });
    (0, node_test_1.test)('refuses a path that is a directory, not a file', async () => {
        const d = (0, path_1.join)(dir, 'adir');
        await (0, promises_1.mkdir)(d, { recursive: true });
        await strict_1.default.rejects(() => (0, runner_1.assertScriptSafe)(cfg(d)), /not a file/i);
    });
    (0, node_test_1.test)('rejects a helper that is NOT root-owned, whatever its mode', async () => {
        // 0500 alone proves nothing: a file the agent owns can be chmod'd back by
        // the agent. Ownership is the part that cannot be undone from inside.
        const p = (0, path_1.join)(dir, 'mine.sh');
        await (0, promises_1.writeFile)(p, '#!/bin/sh\n');
        await (0, promises_1.chmod)(p, 0o500);
        await strict_1.default.rejects(() => (0, runner_1.assertScriptSafe)(cfg(p)), /owned by root/i);
    });
});
(0, node_test_1.describe)('isSafeMode', () => {
    // Tested directly because the ownership check necessarily fires first, which
    // makes this branch unreachable from `assertScriptSafe` for a non-root test.
    (0, node_test_1.test)('accepts modes only root can write', () => {
        for (const ok of [0o500, 0o550, 0o555, 0o700, 0o755]) {
            strict_1.default.equal((0, runner_1.isSafeMode)(ok), true, ok.toString(8));
        }
    });
    (0, node_test_1.test)('REFUSES group-writable', () => {
        for (const bad of [0o520, 0o570, 0o770])
            strict_1.default.equal((0, runner_1.isSafeMode)(bad), false, bad.toString(8));
    });
    (0, node_test_1.test)('REFUSES world-writable', () => {
        for (const bad of [0o502, 0o507, 0o777, 0o666])
            strict_1.default.equal((0, runner_1.isSafeMode)(bad), false, bad.toString(8));
    });
    (0, node_test_1.test)('the intended deployment mode passes', () => {
        strict_1.default.equal((0, runner_1.isSafeMode)(0o500), true);
    });
});
(0, node_test_1.describe)('isSafeOwner', () => {
    (0, node_test_1.test)('only uid 0', () => {
        strict_1.default.equal((0, runner_1.isSafeOwner)(0), true);
        for (const bad of [1, 1000, 65534])
            strict_1.default.equal((0, runner_1.isSafeOwner)(bad), false, String(bad));
    });
});
//# sourceMappingURL=runner.test.js.map