/**
 * Structured client/server logging (plan §12). Levels, no PII.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function emit(level: Level, message: string, context?: LogContext): void {
  const entry = { level, message, ts: new Date().toISOString(), ...context };

  // Console output — structured, greppable.
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) => {
    emit('error', message, {
      ...context,
      ...(error instanceof Error ? { error: error.message, stack: error.stack } : {}),
    });
  },
};
