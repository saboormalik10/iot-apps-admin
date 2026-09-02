import { Schema, model, Document, Types } from 'mongoose';

/**
 * One row per file the ingest agent has handed us. Two jobs.
 *
 * 1. IDEMPOTENCY. `MetMeasure` cannot carry a unique index — 280 timestamps in the
 *    real corpus repeat with genuinely different readings, so uniqueness on
 *    (device, timestamp) would reject valid data. Idempotency therefore lives one
 *    level up, on the file's content hash.
 *
 *    Keyed on (organizationId, deviceId, contentSha256) rather than filename
 *    alone: a corrected re-upload under the same name must be accepted, and two
 *    different stations that happen to record identical bytes must not dedupe
 *    against each other.
 *
 * 2. PROVENANCE. Per-file ingest history without writing 1,440 AuditLog rows per
 *    station per day — which would be 5.2M rows a year for ten stations against a
 *    collection with a 2-year TTL.
 *
 * The `pending` state exists so a crash between inserting measures and marking
 * the file done can be detected and recovered: a stale `pending` row is taken
 * over, its timestamp range deleted, and the file re-ingested cleanly.
 */

export type MetIngestFileState = 'pending' | 'done' | 'rejected';

export interface IMetIngestFile extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  recordId: Types.ObjectId | null;
  filename: string;
  contentSha256: string;
  state: MetIngestFileState;
  rows: number;
  skipped: number;
  /** Timestamp span of the rows written — used to undo a half-finished attempt. */
  firstTsMs: number | null;
  lastTsMs: number | null;
  /** Local day keys this file touched, so the rollup knows what to recompute. */
  dayKeys: string[];
  truncated: boolean;
  reason: string | null;
  agentVersion: string | null;
  receivedAt: Date;
  completedAt: Date | null;
}

const metIngestFileSchema = new Schema<IMetIngestFile>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    recordId: { type: Schema.Types.ObjectId, ref: 'MetRecord', default: null },
    filename: { type: String, required: true },
    contentSha256: { type: String, required: true },
    state: { type: String, enum: ['pending', 'done', 'rejected'], required: true, default: 'pending' },
    rows: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    firstTsMs: { type: Number, default: null },
    lastTsMs: { type: Number, default: null },
    dayKeys: { type: [String], default: [] },
    truncated: { type: Boolean, default: false },
    reason: { type: String, default: null },
    agentVersion: { type: String, default: null },
    receivedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

/** The idempotency key. A duplicate insert throws E11000, which is the signal. */
metIngestFileSchema.index({ organizationId: 1, deviceId: 1, contentSha256: 1 }, { unique: true });

/** Admin "recent ingests" view. */
metIngestFileSchema.index({ organizationId: 1, deviceId: 1, receivedAt: -1 });

/**
 * 45 days — deliberately LONGER than the 30-day MetMeasure TTL.
 *
 * If this ledger expired first, a file whose measures had already aged out could
 * be re-ingested from the agent's archive and silently resurrect deleted data.
 * The ledger must outlive what it is protecting.
 */
// 23 days — the longest of the three ON PURPOSE. This is the fingerprint ledger
// that stops a file being ingested twice; if it expired first, a file replayed
// from the permanent archive would resurrect readings that had just been deleted.
metIngestFileSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 1_987_200 });

export const MetIngestFile = model<IMetIngestFile>('MetIngestFile', metIngestFileSchema);
