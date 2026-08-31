/**
 * Configuration, validated once at boot.
 *
 * The backend's convention is to read `process.env` at the point of use and
 * validate there, because a request can fail cleanly. A long-running worker has
 * no request scope: a missing variable discovered an hour in means an hour of
 * files silently not moving. So this fails fast at startup instead.
 */

export interface AgentConfig {
  apiBaseUrl: string;
  token: string;
  account: string;
  /** Root the station uploads into. Children of this are the working dirs. */
  rootDir: string;
  uploadDir: string;
  stagingDir: string;
  archiveDir: string;
  quarantineDir: string;
  pollIntervalMs: number;
  /** A file must be untouched for this long before it is considered settled. */
  stableMs: number;
  /** After this, an incomplete file is accepted as permanently truncated. */
  lateMs: number;
  /**
   * Filename prefixes the agent will pick up. Everything else is LEFT ALONE.
   *
   * The station writes more than one kind of file into the same folder, and the
   * backend resolves its parser from the folder — so a file of a different kind
   * is parsed as wind and silently mis-stored. `Environmental_*` loses humidity
   * that way (the alias list expects `humidity_pct`, the file says
   * `humidity_percent`), and the retired `EnvDiagnostic_*` files inserted ~60
   * all-null rows a minute.
   *
   * Filtering here is deliberately conservative: unmatched files are not
   * touched, not moved and not deleted, so they wait on disk until per-prefix
   * routing lands and can then be backfilled.
   */
  filePrefixes: string[];
  maxFilesPerRequest: number;
  maxBytesPerRequest: number;
  requestTimeoutMs: number;
  agentVersion: string;
  once: boolean;
  dryRun: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set`);
  return v.trim();
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return n;
}

export function loadConfig(argv: string[] = process.argv): AgentConfig {
  const root = process.env.OBSERVATOR_ROOT_DIR?.trim() || '/home/wxstation';
  const apiBaseUrl = required('OBSERVATOR_API_URL').replace(/\/+$/, '');

  if (!/^https?:\/\//.test(apiBaseUrl)) {
    throw new Error(`OBSERVATOR_API_URL must be an absolute http(s) URL, got "${apiBaseUrl}"`);
  }

  const account = required('OBSERVATOR_ACCOUNT');
  // Same charset the backend and the provisioning script enforce. Each layer
  // validates independently — any one of them can be bypassed on its own.
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(account)) {
    throw new Error(`OBSERVATOR_ACCOUNT "${account}" must match ^[a-z][a-z0-9_-]{2,31}$`);
  }

  const token = required('OBSERVATOR_INGEST_TOKEN');
  if (!token.startsWith('obsi_')) {
    throw new Error('OBSERVATOR_INGEST_TOKEN must be an ingest credential (obsi_…)');
  }

  return {
    apiBaseUrl,
    token,
    account,
    rootDir: root,
    uploadDir: `${root}/upload`,
    stagingDir: `${root}/staging`,
    archiveDir: `${root}/archive`,
    quarantineDir: `${root}/quarantine`,
    filePrefixes: (process.env.OBSERVATOR_FILE_PREFIXES ?? 'WindSonic_')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    pollIntervalMs: num('OBSERVATOR_POLL_MS', 5_000),
    stableMs: num('OBSERVATOR_STABLE_MS', 20_000),
    lateMs: num('OBSERVATOR_LATE_MS', 300_000),
    maxFilesPerRequest: num('OBSERVATOR_MAX_FILES', 60),
    maxBytesPerRequest: num('OBSERVATOR_MAX_BYTES', 4 * 1024 * 1024),
    requestTimeoutMs: num('OBSERVATOR_TIMEOUT_MS', 60_000),
    agentVersion: process.env.OBSERVATOR_AGENT_VERSION?.trim() || '1.0.0',
    once: argv.includes('--once'),
    dryRun: argv.includes('--dry-run'),
  };
}
