import { DEFAULT_GMX_FIELDS, type ChecksumMode } from './gmx';
import type { RainMode } from './rain';

/**
 * The sensor stream's settings, read ONCE at startup from the environment — on a
 * site PC, the config file the services load. A change takes effect on restart,
 * which is what the client asked for: *"if the server is restarted, it can grab
 * from a file"*.
 *
 * Every value has a working default, and a bad value falls back to it with a
 * warning rather than stopping the service: a typo in the config file must not
 * take the whole display down. `warnings` says what was ignored.
 */
export interface StreamConfig {
  /** Off only in tests, which start many app instances. */
  enabled: boolean;
  /**
   * Who opens the connection.
   *
   * `listen` (default): the converter connects IN to this PC, as the client said
   * — *"you should listen to that port"*. `connect`: this PC dials the converter,
   * which is how serial device servers such as the MOXA NPort he linked usually
   * work out of the box. Either answer to that open question is then a setting.
   */
  mode: 'listen' | 'connect';
  /** TCP port the converter connects to (`listen`). */
  port: number;
  /** Address to listen on; all interfaces by default, since the converter is on the LAN. */
  host: string;
  /** The converter's address and port (`connect`). */
  remoteHost: string | null;
  remotePort: number;
  /** First wait before redialling a dropped converter; doubles to a 30 s ceiling. */
  redialMs: number;
  /** Column order before the unit's own header line is seen. */
  fields: string[];
  rainMode: RainMode;
  checksum: ChecksumMode;
  /** Wind direction from the compass-corrected column when the unit sends it. */
  preferCorrectedDirection: boolean;
  /** Which station the stream writes to; the site's only MET station when unset. */
  stationBleId: string | null;
  /** How long after a minute ends to wait for stragglers before writing it. */
  flushGraceMs: number;
  /** Close a connection that has sent nothing for this long, so the converter reconnects. */
  idleTimeoutMs: number;
  /** Longest line accepted before the buffer is discarded. */
  maxLineBytes: number;
  warnings: string[];
}

export function readStreamConfig(env: NodeJS.ProcessEnv = process.env): StreamConfig {
  const warnings: string[] = [];

  const int = (key: string, fallback: number, min: number, max: number): number => {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      warnings.push(`${key}="${raw}" is not a whole number from ${min} to ${max}; using ${fallback}`);
      return fallback;
    }
    return n;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = env[key]?.trim().toLowerCase();
    if (!raw) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    warnings.push(`${key}="${env[key]}" is not one of ${allowed.join(', ')}; using ${fallback}`);
    return fallback;
  };

  const fieldsRaw = env.STREAM_FIELDS?.trim();
  const fields = fieldsRaw
    ? fieldsRaw.split(',').map((f) => f.trim().toUpperCase()).filter(Boolean)
    : [...DEFAULT_GMX_FIELDS];

  let mode = oneOf('STREAM_MODE', ['listen', 'connect'] as const, 'listen');
  const remoteHost = env.STREAM_REMOTE_HOST?.trim() || null;
  if (mode === 'connect' && !remoteHost) {
    warnings.push('STREAM_MODE=connect needs STREAM_REMOTE_HOST (the converter\'s address); listening instead');
    mode = 'listen';
  }

  const enabledRaw = env.STREAM_ENABLED?.trim().toLowerCase();
  const enabled = enabledRaw ? enabledRaw !== 'false' && enabledRaw !== '0' : env.NODE_ENV !== 'test';

  return {
    enabled,
    mode,
    // 0 = any free port; tests use it.
    port: int('STREAM_TCP_PORT', 4000, 0, 65_535),
    host: env.STREAM_HOST?.trim() || '0.0.0.0',
    remoteHost,
    remotePort: int('STREAM_REMOTE_PORT', 4000, 1, 65_535),
    redialMs: int('STREAM_REDIAL_MS', 2_000, 100, 60_000),
    fields,
    rainMode: oneOf('STREAM_RAIN_MODE', ['total', 'interval'] as const, 'total'),
    checksum: oneOf('STREAM_CHECKSUM', ['auto', 'require', 'off'] as const, 'auto'),
    preferCorrectedDirection: oneOf('STREAM_DIRECTION', ['corrected', 'raw'] as const, 'corrected') === 'corrected',
    stationBleId: env.STREAM_STATION_BLE_ID?.trim() || null,
    flushGraceMs: int('STREAM_FLUSH_GRACE_MS', 5_000, 0, 60_000),
    idleTimeoutMs: int('STREAM_IDLE_TIMEOUT_MS', 5 * 60_000, 10_000, 24 * 60 * 60_000),
    maxLineBytes: int('STREAM_MAX_LINE_BYTES', 4096, 256, 1_048_576),
    warnings,
  };
}
