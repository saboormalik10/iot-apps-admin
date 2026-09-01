"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
/** Timestamped lines to stdout/stderr; journald adds the rest. */
const line = (level, msg) => `${new Date().toISOString()} ${level} ${msg}`;
exports.log = {
    info: (m) => console.log(line('INFO ', m)),
    warn: (m) => console.warn(line('WARN ', m)),
    error: (m) => console.error(line('ERROR', m)),
};
//# sourceMappingURL=log.js.map