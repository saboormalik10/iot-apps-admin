import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import { ProvisioningJob, IProvisioningJob, ProvisioningJobType } from '../models/ProvisioningJob';
import { assertValidAccountName, assertValidFolderSegment } from './account-name';

/**
 * How long a claimed job may sit before another agent may take it.
 *
 * Long enough that a slow `useradd` is not stolen mid-flight, short enough that
 * an agent killed between claim and report does not strand the job until
 * somebody notices.
 */
const LEASE_MS = 5 * 60 * 1000;

/** Give up after this many attempts, so a poison job cannot loop forever. */
const MAX_ATTEMPTS = 3;

/**
 * How long a generated password waits to be collected.
 *
 * Fifteen minutes is long enough for the operator who pressed the button to read
 * it, and short enough that one forgotten in a browser tab is not a standing
 * liability.
 */
const SECRET_TTL_MS = 15 * 60 * 1000;

const badReq = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });

export interface QueueJobInput {
  organizationId: string;
  type: ProvisioningJobType;
  args: Record<string, unknown>;
  createdBy?: string | null;
}

/**
 * The provisioning job queue.
 *
 * Arguments are validated HERE as well as at the API edge and again in the
 * agent. Three layers is deliberate: this is the one part of the system where a
 * bad string becomes a root-level shell command, and no single check should be
 * load-bearing.
 */
@Injectable()
export class ProvisionService {
  /**
   * Called after a job succeeds. Set by `StationsService` at module init rather
   * than injected, because the two services would otherwise depend on each
   * other and Nest would refuse to construct either.
   */
  private onSuccess:
    | ((job: { type: string; args: Record<string, unknown>; result?: Record<string, unknown> | null }) => Promise<void>)
    | null = null;

  registerSuccessHook(
    fn: (job: { type: string; args: Record<string, unknown>; result?: Record<string, unknown> | null }) => Promise<void>,
  ): void {
    this.onSuccess = fn;
  }

  /** Validate and enqueue. Returns the job as the caller should see it. */
  async queue(input: QueueJobInput) {
    const args = this.validateArgs(input.type, input.args ?? {});

    const job = await ProvisioningJob.create({
      organizationId: new Types.ObjectId(input.organizationId),
      type: input.type,
      args,
      status: 'queued',
      createdBy: input.createdBy && Types.ObjectId.isValid(input.createdBy) ? new Types.ObjectId(input.createdBy) : null,
    });
    return this.publicJob(job);
  }

  /**
   * Hand the oldest queued job to an agent, atomically.
   *
   * `findOneAndUpdate` rather than find-then-save: two agents polling at once
   * would otherwise both read the same queued job and both run it, which for
   * `createStationAccount` means a duplicate `useradd` and a confusing failure.
   *
   * Also reclaims a job whose lease expired — an agent killed between claiming
   * and reporting would otherwise strand it forever.
   */
  async claimNext(agentId: string) {
    const staleBefore = new Date(Date.now() - LEASE_MS);

    const job = await ProvisioningJob.findOneAndUpdate(
      {
        $or: [
          { status: 'queued' },
          { status: 'claimed', claimedAt: { $lt: staleBefore } },
        ],
        attempts: { $lt: MAX_ATTEMPTS },
      },
      {
        $set: { status: 'claimed', claimedAt: new Date(), claimedBy: agentId.slice(0, 64) },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    );

    return job ? this.publicJob(job) : null;
  }

  /**
   * Record the outcome an agent reports.
   *
   * A failure below `MAX_ATTEMPTS` returns to `queued` so a transient problem
   * (the box rebooting mid-job) retries; at the ceiling it stays `failed` so a
   * genuinely broken job stops burning attempts and becomes visible.
   */
  async report(
    jobId: string,
    outcome: { ok: boolean; result?: Record<string, unknown>; error?: string; password?: string },
  ) {
    if (!Types.ObjectId.isValid(jobId)) throw badReq('Unknown job', 'NOT_FOUND');

    const job = await ProvisioningJob.findById(jobId);
    if (!job) throw badReq('Unknown job', 'NOT_FOUND');

    if (outcome.ok) {
      job.status = 'succeeded';
      // Parked separately from `result`, which is readable for 90 days.
      // The agent sends the password at the TOP LEVEL; `result.password` is kept
      // as a fallback so an older agent still works. Reading only `result` meant
      // the secret was never captured and the operator had no way to get it.
      const secret = outcome.password ?? this.extractSecret(outcome.result ?? {});
      if (secret) {
        job.secretOnce = secret;
        job.secretExpiresAt = new Date(Date.now() + SECRET_TTL_MS);
      }
      job.result = this.scrub(outcome.result ?? {});
      job.error = null;
      job.completedAt = new Date();
    } else {
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      job.status = exhausted ? 'failed' : 'queued';
      job.error = (outcome.error ?? 'unknown error').slice(0, 500);
      job.completedAt = exhausted ? new Date() : null;
      // A retry starts unclaimed, or the lease check would hold it for 5 minutes.
      job.claimedAt = null;
      job.claimedBy = null;
    }

    await job.save();

    // Fire-and-forget, and AFTER the save: the job's own outcome must be
    // recorded even if activating the station mapping fails.
    if (outcome.ok && this.onSuccess) {
      await this.onSuccess({ type: job.type, args: job.args ?? {}, result: job.result }).catch(() => void 0);
    }

    return this.publicJob(job);
  }

  async list(organizationId: string, limit = 50) {
    const jobs = await ProvisioningJob.find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200));
    return jobs.map((j) => this.publicJob(j));
  }

  /**
   * Per-job argument validation.
   *
   * An unknown type is refused rather than passed through: the agent's set of
   * actions is fixed, and a job it cannot recognise would sit claimed-and-failing
   * until it exhausted its attempts.
   */
  private validateArgs(type: ProvisioningJobType, args: Record<string, unknown>): Record<string, unknown> {
    const str = (key: string): string => {
      const v = args[key];
      if (typeof v !== 'string' || !v.trim()) throw badReq(`${key} is required`);
      return v.trim();
    };

    /**
     * Carried through the whitelist, when present.
     *
     * This is the link back to the station the job belongs to, and it is what
     * tells `onJobSucceeded` which mapping to activate. Whitelisting it away
     * made a restore queue successfully and then never reconnect the station —
     * a silent no-op with no error anywhere.
     *
     * It is NOT passed to the agent's command line; the agent only ever reads
     * `account` and `folder`.
     */
    const link = (): Record<string, string> => {
      const v = args.stationAccountId;
      return typeof v === 'string' && v ? { stationAccountId: v } : {};
    };

    switch (type) {
      case 'createStationAccount': {
        const account = str('account');
        assertValidAccountName(account);
        const folder = str('folder');
        assertValidFolderSegment(folder);
        return { account, folder, ...link() };
      }
      case 'enableIngestAgent':
      case 'disableIngestAgent':
      case 'rotateStationPassword':
      case 'disableStationAccount':
      case 'reportStationUsage': {
        const account = str('account');
        assertValidAccountName(account);
        return { account, ...link() };
      }
      case 'createStationFolder': {
        const account = str('account');
        assertValidAccountName(account);
        const folder = str('folder');
        assertValidFolderSegment(folder);
        return { account, folder, ...link() };
      }
      default:
        throw badReq(`Unknown provisioning job type: ${String(type)}`, 'UNKNOWN_JOB_TYPE');
    }
  }

  /**
   * Strip anything secret-shaped from an agent's report before it is stored.
   *
   * A generated password must reach the operator ONCE, through the API response
   * — never the job document, which is readable for 90 days and shows up in
   * backups.
   */
  /**
   * Park a secret the AGENT will collect — the reverse of the password flow.
   *
   * `enableIngestAgent` has to get that customer's ingest token onto the box.
   * Putting it in `job.args` would persist a live credential in a document that
   * is readable for 90 days and lands in every backup. So it travels the same
   * way a generated password does, just in the other direction: parked once,
   * read once, then gone.
   */
  async parkSecretForAgent(jobId: string, secret: string): Promise<void> {
    await ProvisioningJob.updateOne(
      { _id: new Types.ObjectId(jobId) },
      { $set: { secretOnce: secret, secretExpiresAt: new Date(Date.now() + SECRET_TTL_MS) } },
    );
  }

  /** The generated password, if the agent reported one. */
  private extractSecret(result: Record<string, unknown>): string | null {
    const v = result.password;
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  /**
   * Collect a generated password. ONE READ, then it is gone.
   *
   * Cleared with a conditional update rather than read-then-save: two operators
   * pressing the button at once would otherwise both be shown it, and "one read"
   * would be a claim rather than a guarantee.
   */
  async collectSecret(jobId: string, forOrganizationId?: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(jobId)) return null;

    // When an AGENT collects (rather than an operator), the job must belong to
    // the organisation its credential is scoped to. Without this a valid agent
    // token could read any job's secret by guessing an id — including another
    // customer's ingest token, which would undo the whole point of one agent per
    // customer.
    const scope =
      forOrganizationId && Types.ObjectId.isValid(forOrganizationId)
        ? { organizationId: new Types.ObjectId(forOrganizationId) }
        : {};

    const job = await ProvisioningJob.findOneAndUpdate(
      {
        _id: new Types.ObjectId(jobId),
        ...scope,
        secretOnce: { $ne: null },
        secretExpiresAt: { $gt: new Date() },
      },
      { $set: { secretOnce: null, secretExpiresAt: null } },
      { new: false },
    );
    return job?.secretOnce ?? null;
  }

  private scrub(result: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result)) {
      if (/pass|secret|token|key/i.test(k)) continue;
      out[k] = v;
    }
    return out;
  }

  private publicJob(job: IProvisioningJob) {
    return {
      id: String(job._id),
      organizationId: String(job.organizationId),
      type: job.type,
      args: job.args,
      status: job.status,
      attempts: job.attempts,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }
}
