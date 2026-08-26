import { Schema, model, Document, Types } from 'mongoose';

/**
 * A unit of work for the provisioning agent on the SFTP box.
 *
 * WHY A QUEUE AND NOT AN API CALL: provisioning creates Unix accounts, which
 * means the backend cannot do it — it does not run on that machine, and giving
 * it SSH access would put a remote-shell credential in the web tier. The agent
 * on the box POLLS for work instead, so the box needs no inbound port, no TLS
 * certificate and no listening service. The only credential involved is
 * outbound-only.
 *
 * Everything the agent is allowed to do is enumerated by `type` — it never
 * receives a command to run. That is the whole safety model: a compromised
 * backend can queue a job, but the set of jobs is fixed and each has its own
 * validated arguments.
 */
export type ProvisioningJobType =
  | 'createStationAccount'
  | 'rotateStationPassword'
  | 'disableStationAccount'
  | 'createStationFolder'
  | 'reportStationUsage';

export type ProvisioningJobStatus = 'queued' | 'claimed' | 'succeeded' | 'failed';

export interface IProvisioningJob extends Document {
  organizationId: Types.ObjectId;
  type: ProvisioningJobType;
  /**
   * Validated arguments for this job type. NEVER a command line — the agent
   * matches on `type` and builds its own invocation.
   */
  args: Record<string, unknown>;
  status: ProvisioningJobStatus;
  /** Set when an agent claims it; a claim older than the lease is reclaimable. */
  claimedAt: Date | null;
  claimedBy: string | null;
  attempts: number;
  /** Result reported by the agent. Never contains a secret. */
  result: Record<string, unknown> | null;
  /**
   * A generated password, held ONLY until an operator reads it.
   *
   * A password has to reach a human somehow, and the agent that generates it is
   * not talking to one. So it is parked here, cleared on first read, and expired
   * by TTL if nobody ever collects it. It is deliberately NOT in `result`, which
   * is readable for 90 days and lands in backups.
   */
  secretOnce: string | null;
  /**
   * When `secretOnce` stops being available, read or not.
   * Enforced on read — see the note by the indexes as to why not a TTL.
   */
  secretExpiresAt: Date | null;
  error: string | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

const provisioningJobSchema = new Schema<IProvisioningJob>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'createStationAccount',
        'rotateStationPassword',
        'disableStationAccount',
        'createStationFolder',
        'reportStationUsage',
      ],
    },
    args: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, required: true, enum: ['queued', 'claimed', 'succeeded', 'failed'], default: 'queued' },
    claimedAt: { type: Date, default: null },
    claimedBy: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    result: { type: Schema.Types.Mixed, default: null },
    secretOnce: { type: String, default: null },
    secretExpiresAt: { type: Date, default: null },
    error: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The claim query: oldest queued job first.
provisioningJobSchema.index({ status: 1, createdAt: 1 });
provisioningJobSchema.index({ organizationId: 1, createdAt: -1 });
// Finished jobs are an audit trail, but not forever — 90 days outlives any
// question about how a station came to exist.
provisioningJobSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 7_776_000, partialFilterExpression: { status: { $in: ['succeeded', 'failed'] } } },
);

// NO TTL INDEX ON `secretExpiresAt`. A MongoDB TTL deletes the whole DOCUMENT,
// not the field — one here would erase the provisioning audit trail minutes
// after every password rotation. Expiry is enforced on READ instead, and the
// field is cleared the moment it is collected.

export const ProvisioningJob = model<IProvisioningJob>('ProvisioningJob', provisioningJobSchema);
