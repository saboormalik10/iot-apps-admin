/**
 * Wire contract with the backend.
 *
 * Kept deliberately in sync with backend/src/ingest/dto.ts. If the two drift,
 * files stop moving — so any change here needs the matching change there.
 */

export interface IngestFilePayload {
  /**
   * Path relative to the upload root — LOCAL ONLY, stripped before sending.
   *
   * The server is told the basename; this is what the agent moves on disk, and
   * the two differ once files live in tower subfolders.
   */
  rel?: string;
  name: string;
  content: string;
  sha256: string;
}

export interface IngestBatchPayload {
  account: string;
  /**
   * Upload folder relative to the account root, e.g. `Observator/Demo Tower`.
   * Batch-level: the server emits one event per request, so a batch belongs to
   * exactly one station. Empty for the flat legacy layout.
   */
  folder?: string;
  agentVersion: string;
  files: IngestFilePayload[];
}

/**
 *  ingested  — rows written; archive the file
 *  duplicate — this exact content was already ingested; archive it
 *  rejected  — permanently unusable; quarantine, never retry
 *  retry     — another request holds it; leave it and try again later
 */
export type IngestFileStatus = 'ingested' | 'duplicate' | 'rejected' | 'retry';

export interface IngestFileResult {
  name: string;
  status: IngestFileStatus;
  rows?: number;
  skipped?: number;
  reason?: string;
  dayKeys?: string[];
  truncated?: boolean;
  warnings?: number;
  sensorsSeen?: string[];
}

export interface IngestResponse {
  data: {
    account: string;
    organizationId: string;
    deviceId: string | null;
    results: IngestFileResult[];
  };
}
