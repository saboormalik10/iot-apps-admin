import { Injectable, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';

import { Organization } from '../models/Organization';
import { randomBytes } from 'crypto';
import { Device } from '../models/Device';
import { StationAccount } from '../models/StationAccount';
import { ProvisioningJob } from '../models/ProvisioningJob';
import { AuditLog } from '../models/AuditLog';
import { ProvisionService } from './provision.service';
import { ServiceCredential } from '../models/ServiceCredential';
import { hashToken } from '../common/guards/service-credential.guard';
import { assertValidAccountName, assertValidFolderSegment, isValidAccountName } from './account-name';

const badReq = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });
const notFound = (msg = 'Not found') => Object.assign(new Error(msg), { statusCode: 404, code: 'NOT_FOUND' });

export interface ProvisionStationInput {
  organizationId: string;
  /** Display name of the tower, e.g. `Demo Tower`. Becomes the upload folder. */
  towerName: string;
  /** Unix account. Derived from the customer when omitted. */
  account?: string;
  notes?: string;
}

/**
 * Provisioning a station, end to end.
 *
 * ORDER MATTERS. The database rows are created FIRST and left INACTIVE, then the
 * job is queued. `resolveStation` already requires `isActive: true`, so an
 * inactive mapping cannot ingest anything — which means a half-finished
 * provisioning is inert rather than dangerous. The alternative (queue first,
 * create rows on success) leaves a window where the Unix account exists and
 * files can land with nowhere to route them.
 */
@Injectable()
export class StationsService implements OnModuleInit {
  constructor(private readonly provision: ProvisionService) {}

  onModuleInit(): void {
    this.provision.registerSuccessHook((job) => this.onJobSucceeded(job));
  }

  async provisionStation(input: ProvisionStationInput, actor: { userId: string; email: string }) {
    const org = await Organization.findOne({ _id: input.organizationId, deletedAt: null }).lean();
    if (!org) throw notFound('Customer not found');

    const towerName = (input.towerName ?? '').trim();
    assertValidFolderSegment(towerName);

    const account = (input.account ?? '').trim() || this.deriveAccount(org.slug);
    assertValidAccountName(account);

    /**
     * The folder is the TOWER NAME ALONE — the account already identifies the
     * customer.
     *
     * This used to store `<org.uploadFolder>/<tower>`, which never matched what
     * exists on disk. Each customer gets their own chrooted SFTP account, so the
     * provisioning agent creates `~/upload/<tower>` and the ingest agent reports
     * the folder relative to that upload root — `"Demo Tower"`, not
     * `"Acme Marine Services/Demo Tower"`. The lookup is keyed on
     * `(account, folderPath)`, so the stored prefix meant every properly
     * provisioned customer got `UNKNOWN_STATION` on every file.
     *
     * It went unnoticed because the only live customer has an empty
     * `uploadFolder`, which makes the prefix "" and the two forms identical.
     */
    const folderPath = towerName;

    const [accountClash, folderClash] = await Promise.all([
      StationAccount.findOne({ account, folderPath: { $ne: folderPath } }).lean(),
      // Scoped to the ACCOUNT, not global: two customers each having a
      // "Demo Tower" is normal and correct — they are different chroots. Only a
      // clash within one account would route one tower's readings to another.
      StationAccount.findOne({ account, folderPath }).lean(),
    ]);
    if (folderClash) throw badReq(`This customer already has a folder "${folderPath}"`, 'DUPLICATE_FOLDER');
    if (accountClash && String(accountClash.organizationId) !== String(org._id)) {
      throw badReq(`The account "${account}" belongs to another customer`, 'ACCOUNT_TAKEN');
    }

    const device = await Device.create({
      organizationId: org._id,
      name: towerName,
      type: 'MET-LINK',
      bleId: `sftp-${account}-${Date.now()}`,
      isActive: true,
    });

    const mapping = await StationAccount.create({
      account,
      folderPath,
      organizationId: org._id,
      deviceId: device._id,
      streamType: 'met-csv',
      // INACTIVE until the agent confirms the Unix account exists. Ingest
      // rejects an inactive mapping, so nothing can route here in the meantime.
      isActive: false,
      notes: (input.notes ?? '').trim(),
    });

    const job = await this.provision.queue({
      organizationId: String(org._id),
      // The tower folder only — the customer folder is the account's own home,
      // created by the same job.
      type: 'createStationAccount',
      args: { account, folder: towerName },
      createdBy: actor.userId,
    });

    // Linked so the job's completion can find what to activate.
    await ProvisioningJob.updateOne({ _id: job.id }, { $set: { 'args.stationAccountId': String(mapping._id) } });

    // The customer's own ingest agent, provisioned automatically.
    await this.ensureIngestAgent(org._id as Types.ObjectId, account, actor);

    AuditLog.create({
      organizationId: org._id,
      userId: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
      userEmail: actor.email,
      action: 'create',
      resourceType: 'station',
      resourceId: String(mapping._id),
      resourceName: `${account} → ${folderPath}`,
      changes: { account, folderPath, deviceId: String(device._id), jobId: job.id },
    }).catch(() => void 0);

    return {
      ...this.sftpEndpoint(),
      stationAccountId: String(mapping._id),
      deviceId: String(device._id),
      account,
      folderPath,
      status: 'pending' as const,
      jobId: job.id,
    };
  }

  /**
   * Activate the mapping once the agent reports the account exists.
   *
   * Called from the job report path rather than polled: the moment the Unix
   * account is real is exactly when files can start arriving, and a mapping that
   * lags behind would reject them as UNKNOWN_STATION.
   */
  async onJobSucceeded(job: {
    type: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown> | null;
  }): Promise<void> {
    if (job.type === 'reportStationUsage') {
      const bytes = Number((job as { result?: Record<string, unknown> }).result?.bytes);
      const account = job.args?.account;
      if (typeof account === 'string' && Number.isFinite(bytes)) {
        await StationAccount.updateMany(
          { account },
          { $set: { diskUsageBytes: bytes, diskUsageAt: new Date() } },
        ).catch(() => void 0);
      }
      return;
    }

    // A plain password rotation carries no station id and must NOT reactivate
    // anything — only a deliberate restore does, and it says so by including one.
    if (job.type !== 'createStationAccount' && job.type !== 'rotateStationPassword') return;
    const id = job.args?.stationAccountId;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) return;
    await StationAccount.updateOne({ _id: new Types.ObjectId(id) }, { $set: { isActive: true } }).catch(() => void 0);
  }

  /** Stations for a customer, with the state of their most recent job. */
  /**
   * Where customers point their SFTP client.
   *
   * The operator has to hand a customer four things — host, port, username,
   * password — and only the last two were ever available in the panel, so the
   * other two had to be known from somewhere else. They are the same for every
   * station on a box, so they are configuration rather than per-station data.
   *
   * Falls back to a clearly-wrong placeholder rather than an empty string: a
   * visible `SFTP_HOST-not-set` in the copied block is far easier to notice than
   * a silently missing line.
   */
  private sftpEndpoint() {
    return {
      sftpHost: (process.env.SFTP_HOST ?? '').trim() || 'SFTP_HOST-not-set',
      sftpPort: Number.parseInt(process.env.SFTP_PORT ?? '22', 10) || 22,
    };
  }

  /**
   * Give this customer their own ingest agent, once.
   *
   * An ingest token is scoped to ONE organisation — the server refuses a token
   * uploading for a customer it does not belong to (verified: a station created
   * for a second customer had every file rejected as UNKNOWN_STATION while the
   * agent held the first customer's token). So a shared agent cannot serve more
   * than one customer, and each needs its own instance and its own credential.
   *
   * Doing it here means adding a customer's first station is a single action in
   * the panel rather than five manual steps on the box — which is the difference
   * between something that works and something that is done wrong eventually.
   *
   * Idempotent: a second station for the same customer reuses the running agent.
   */
  private async ensureIngestAgent(
    organizationId: Types.ObjectId,
    account: string,
    actor: { userId: string; email: string },
  ): Promise<void> {
    const existing = await ServiceCredential.findOne({
      organizationId,
      kind: 'ingest',
      name: `ingest-agent (${account})`,
      revokedAt: null,
    }).lean();
    if (existing) return;                      // already has one — nothing to do

    // `obsi_<prefix>_<secret>`: the prefix is the public lookup key, the secret
    // is never stored — only its hash.
    const prefix = randomBytes(6).toString('hex');
    const token = `obsi_${prefix}_${randomBytes(24).toString('hex')}`;

    await ServiceCredential.create({
      organizationId,
      name: `ingest-agent (${account})`,
      kind: 'ingest',
      tokenPrefix: prefix,
      tokenHash: hashToken(token),
      allowedCidrs: [],
    });

    const job = await this.provision.queue({
      organizationId: String(organizationId),
      type: 'enableIngestAgent',
      args: { account },
      createdBy: actor.userId,
    });

    // The token is NOT put in the job arguments: those persist for 90 days and
    // land in backups. It is parked as a one-read secret the agent collects when
    // it runs the job, then discarded — the same mechanism the generated SFTP
    // password uses, in the opposite direction.
    await this.provision.parkSecretForAgent(job.id, token);
  }

  async list(organizationId: string) {
    const mappings = await StationAccount.find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .lean();

    const jobs = await ProvisioningJob.find({
      organizationId: new Types.ObjectId(organizationId),
      type: 'createStationAccount',
    })
      .sort({ createdAt: -1 })
      .lean();

    const latestFor = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      const sid = j.args?.stationAccountId;
      if (typeof sid === 'string' && !latestFor.has(sid)) latestFor.set(sid, j);
    }

    const endpoint = this.sftpEndpoint();

    return mappings.map((m) => {
      const job = latestFor.get(String(m._id));
      return {
        ...endpoint,
        stationAccountId: String(m._id),
        account: m.account,
        folderPath: m.folderPath,
        deviceId: String(m.deviceId),
        isActive: m.isActive,
        lastIngestAt: m.lastIngestAt,
        diskUsageBytes: m.diskUsageBytes ?? null,
        diskUsageAt: m.diskUsageAt ?? null,
        notes: m.notes,
        // `isActive` is the truth; the job explains WHY it is not active yet.
        status: m.isActive ? 'active' : (job?.status ?? 'unknown'),
        jobError: job?.error ?? null,
        createdAt: m.createdAt,
      };
    });
  }

  /**
   * Rotate a station's SFTP password.
   *
   * The new password never touches the job's stored result — it is parked as a
   * one-read secret the operator collects, then discarded.
   */
  async rotatePassword(stationAccountId: string, actor: { userId: string; email: string }) {
    const mapping = await this.mustFindStation(stationAccountId);

    const job = await this.provision.queue({
      organizationId: String(mapping.organizationId),
      type: 'rotateStationPassword',
      args: { account: mapping.account },
      createdBy: actor.userId,
    });

    this.audit(actor, mapping, 'update', 'rotate password', { jobId: job.id });
    return { ...this.sftpEndpoint(), jobId: job.id, account: mapping.account, status: 'pending' as const };
  }

  /**
   * Revoke a station: lock the Unix account and stop routing to it.
   *
   * DEACTIVATED IMMEDIATELY, before the agent runs. Revocation is what somebody
   * does when a station is compromised or handed to the wrong customer, and
   * waiting for a queue poll to stop accepting their data would be the wrong way
   * round. The agent then locks the OS account so no NEW session can open.
   *
   * The account is LOCKED, never deleted, and the uploaded files stay — the
   * client's retention instruction applies here too.
   */
  async revokeStation(stationAccountId: string, actor: { userId: string; email: string }) {
    const mapping = await this.mustFindStation(stationAccountId);

    await StationAccount.updateOne({ _id: mapping._id }, { $set: { isActive: false } });

    const job = await this.provision.queue({
      organizationId: String(mapping.organizationId),
      type: 'disableStationAccount',
      args: { account: mapping.account },
      createdBy: actor.userId,
    });

    this.audit(actor, mapping, 'update', 'revoke station', { jobId: job.id });
    return { jobId: job.id, account: mapping.account, isActive: false };
  }

  /**
   * Re-enable a station that was revoked.
   *
   * Requires a fresh password — the old one was locked, and re-enabling without
   * rotating would restore access for whoever prompted the revocation.
   */
  async restoreStation(stationAccountId: string, actor: { userId: string; email: string }) {
    const mapping = await this.mustFindStation(stationAccountId);

    const job = await this.provision.queue({
      organizationId: String(mapping.organizationId),
      type: 'rotateStationPassword',
      args: { account: mapping.account, stationAccountId: String(mapping._id) },
      createdBy: actor.userId,
    });

    this.audit(actor, mapping, 'update', 'restore station', { jobId: job.id });
    return { ...this.sftpEndpoint(), jobId: job.id, account: mapping.account, status: 'pending' as const };
  }

  /** Ask the agent how much disk this station's uploads are using. */
  async requestUsageReport(stationAccountId: string, actor: { userId: string; email: string }) {
    const mapping = await this.mustFindStation(stationAccountId);
    const job = await this.provision.queue({
      organizationId: String(mapping.organizationId),
      type: 'reportStationUsage',
      args: { account: mapping.account },
      createdBy: actor.userId,
    });
    return { jobId: job.id, account: mapping.account, status: 'pending' as const };
  }

  private async mustFindStation(stationAccountId: string) {
    if (!Types.ObjectId.isValid(stationAccountId)) throw notFound('Station not found');
    const mapping = await StationAccount.findById(stationAccountId);
    if (!mapping) throw notFound('Station not found');
    return mapping;
  }

  private audit(
    actor: { userId: string; email: string },
    mapping: { _id: unknown; organizationId: unknown; account: string; folderPath: string },
    action: 'create' | 'update' | 'delete',
    what: string,
    changes: Record<string, unknown>,
  ): void {
    AuditLog.create({
      organizationId: mapping.organizationId,
      userId: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
      userEmail: actor.email,
      action,
      resourceType: 'station',
      resourceId: String(mapping._id),
      resourceName: `${what}: ${mapping.account} → ${mapping.folderPath}`,
      changes,
    }).catch(() => void 0);
  }

  /** `acme-marine-services` → `wx-acme-marine`, trimmed to fit the account rules. */
  private deriveAccount(slug: string): string {
    const base = `wx-${(slug || 'station').replace(/[^a-z0-9]+/g, '-')}`
      .replace(/-+/g, '-')
      .replace(/-+$/, '')
      .slice(0, 32);
    return isValidAccountName(base) ? base : `wx-station-${Date.now().toString(36).slice(-6)}`;
  }
}