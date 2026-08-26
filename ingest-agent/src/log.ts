/**
 * Minimal structured logger. Writes to stdout/stderr only — journald captures
 * both under systemd, so there is no file to rotate and no dependency to audit.
 */
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (m: string) => emit('info', m),
  warn: (m: string) => emit('warn', m),
  error: (m: string) => emit('error', m),
};
