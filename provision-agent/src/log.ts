/** Timestamped lines to stdout/stderr; journald adds the rest. */
const line = (level: string, msg: string) => `${new Date().toISOString()} ${level} ${msg}`;

export const log = {
  info: (m: string) => console.log(line('INFO ', m)),
  warn: (m: string) => console.warn(line('WARN ', m)),
  error: (m: string) => console.error(line('ERROR', m)),
};
