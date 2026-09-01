import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { ProvisionService } from '../src/provision/provision.service';
import { ProvisioningJob } from '../src/models/ProvisioningJob';
import { isValidAccountName, isValidFolderSegment } from '../src/provision/account-name';
import { StationsService } from '../src/provision/stations.service';
import { StationAccount } from '../src/models/StationAccount';
import { Organization } from '../src/models/Organization';
import { Device } from '../src/models/Device';

/**
 * Provisioning queue (M21 W1).
 *
 * This is the one part of the system where a bad string becomes a root-level
 * command, so the validation cases matter more than the happy path. The same
 * table is asserted in `provision-agent/src/safety.test.ts` — three independent
 * layers, none of them load-bearing alone.
 */

jest.setTimeout(60_000);

describe('account and folder validation', () => {
  it('accepts the shapes provisioning issues', () => {
    for (const ok of ['wx-acme-01', 'wx_acme', 'abc']) expect(isValidAccountName(ok)).toBe(true);
  });

  it('REFUSES anything a shell would treat as syntax', () => {
    for (const bad of [
      'wx acme', 'wx;rm -rf /', 'wx&&id', 'wx|cat', 'wx$(id)', 'wx`id`', 'wx>out',
      '../etc/passwd', 'wx/acme', "wx'", 'wx"', 'wx\\acme', 'wx*',
    ]) {
      expect([bad, isValidAccountName(bad)]).toEqual([bad, false]);
    }
  });

  it('refuses reserved system accounts', () => {
    for (const bad of ['root', 'sshd', 'www-data', 'wxstation', 'admin']) {
      expect(isValidAccountName(bad)).toBe(false);
    }
  });

  it('accepts a display-facing tower folder but refuses traversal', () => {
    expect(isValidFolderSegment('Demo Tower')).toBe(true);
    for (const bad of ['a/b', '..', 'a/../b', '.hidden', ' Tower', 'Tower;id']) {
      expect([bad, isValidFolderSegment(bad)]).toEqual([bad, false]);
    }
  });
});

describe('ProvisionService', () => {
  const service = new ProvisionService();
  const ORG = new Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });

  afterEach(async () => {
    await ProvisioningJob.deleteMany({ organizationId: ORG });
  });

  afterAll(async () => {
    await ProvisioningJob.deleteMany({ organizationId: ORG });
    await mongoose.disconnect();
  });

  const queue = (args: Record<string, unknown>, type = 'createStationAccount' as const) =>
    service.queue({ organizationId: String(ORG), type, args });

  it('queues a well-formed job', async () => {
    const job = await queue({ account: 'wx-acme-01', folder: 'Tower A' });
    expect(job).toMatchObject({ type: 'createStationAccount', status: 'queued', attempts: 0 });
    expect(job.args).toEqual({ account: 'wx-acme-01', folder: 'Tower A' });
  });

  it('REFUSES to queue an injected account name', async () => {
    // Refused at the edge, so it never reaches the agent at all.
    await expect(queue({ account: 'root; rm -rf /', folder: 'Tower A' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a traversal folder', async () => {
    await expect(queue({ account: 'wx-acme-01', folder: '../../etc' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an unknown job type instead of passing it through', async () => {
    await expect(
      service.queue({ organizationId: String(ORG), type: 'runShell' as never, args: { account: 'wx-acme-01' } }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_JOB_TYPE' });
  });

  it('trims arguments, so a stray space cannot create a different account', async () => {
    const job = await queue({ account: '  wx-acme-01  ', folder: '  Tower A  ' });
    expect(job.args).toEqual({ account: 'wx-acme-01', folder: 'Tower A' });
  });

  it('claims a job atomically — two agents cannot get the same one', async () => {
    // The reason for findOneAndUpdate: a duplicate `useradd` is a confusing
    // failure at best.
    await queue({ account: 'wx-race-01', folder: 'Tower A' });
    const [a, b] = await Promise.all([service.claimNext('agent-1'), service.claimNext('agent-2')]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.status).toBe('claimed');
  });

  it('returns null when the queue is empty — the normal case', async () => {
    expect(await service.claimNext('agent-1')).toBeNull();
  });

  it('hands out the oldest job first', async () => {
    const first = await queue({ account: 'wx-first-01', folder: 'A' });
    await new Promise((r) => setTimeout(r, 10));
    await queue({ account: 'wx-second-1', folder: 'B' });
    expect((await service.claimNext('agent-1'))!.id).toBe(first.id);
  });

  it('records success and stops handing the job out', async () => {
    await queue({ account: 'wx-done-01', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    const done = await service.report(claimed!.id, { ok: true, result: { home: '/home/wx-done-01' } });

    expect(done.status).toBe('succeeded');
    expect(done.completedAt).toBeTruthy();
    expect(await service.claimNext('agent-1')).toBeNull();
  });

  it('STRIPS a password from the stored result', async () => {
    // A generated password reaches the operator once, through the response. The
    // job document is readable for 90 days and lands in backups.
    await queue({ account: 'wx-secret-1', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    const done = await service.report(claimed!.id, {
      ok: true,
      result: { account: 'wx-secret-1', password: 'hunter2', apiKey: 'k', someSecret: 's' },
    });

    expect(JSON.stringify(done.result)).not.toContain('hunter2');
    expect(done.result).toEqual({ account: 'wx-secret-1' });
  });

  it('parks a TOP-LEVEL password as the one-read secret', async () => {
    // The agent sends the password at the top level of its report, NOT inside
    // `result`. The service only looked inside `result`, so every provisioning
    // and rotation succeeded while leaving no recoverable credential — the
    // operator had no way to get the password at all (M24).
    await queue({ account: 'wx-toplevel-1', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    await service.report(claimed!.id, { ok: true, result: { account: 'wx-toplevel-1' }, password: 's3cret-pw' });

    const first = await service.collectSecret(claimed!.id);
    expect(first).toBe('s3cret-pw');

    // ONE read only.
    expect(await service.collectSecret(claimed!.id)).toBeNull();
  });

  it('never stores the top-level password on the job', async () => {
    await queue({ account: 'wx-toplevel-2', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    const done = await service.report(claimed!.id, { ok: true, result: { account: 'wx-toplevel-2' }, password: 'leaky' });
    expect(JSON.stringify(done.result)).not.toContain('leaky');
  });

  it('DECLARES password on the DTO, or whitelist strips it before we see it', async () => {
    // The failure this guards is invisible at the service level: the global
    // ValidationPipe runs `whitelist: true`, so a field the DTO does not declare
    // is deleted from the body before the controller is reached. Asserting the
    // service alone would keep passing while the HTTP path silently lost it.
    const { JobResultDto } = await import('../src/provision/dto');
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');

    const dto = plainToInstance(JobResultDto, { ok: true, password: 'kept', result: {} }, {
      excludeExtraneousValues: false,
    });
    const errors = await validate(dto as object, { whitelist: true });
    expect(errors).toEqual([]);
    expect((dto as { password?: string }).password).toBe('kept');
  });

  it('requeues a transient failure so it retries', async () => {
    await queue({ account: 'wx-retry-01', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    const failed = await service.report(claimed!.id, { ok: false, error: 'box rebooting' });

    expect(failed.status).toBe('queued');
    // Immediately available again — not held for the lease period.
    expect(await service.claimNext('agent-2')).not.toBeNull();
  });

  it('gives up after the attempt ceiling, so a poison job stops looping', async () => {
    await queue({ account: 'wx-poison-1', folder: 'A' });
    let last;
    for (let i = 0; i < 3; i += 1) {
      const claimed = await service.claimNext('agent-1');
      expect(claimed).not.toBeNull();
      last = await service.report(claimed!.id, { ok: false, error: 'always fails' });
    }
    expect(last!.status).toBe('failed');
    expect(await service.claimNext('agent-1')).toBeNull();
  });

  it('reclaims a job whose agent died mid-flight', async () => {
    // Otherwise an agent killed between claiming and reporting strands the job
    // until somebody notices.
    await queue({ account: 'wx-stale-01', folder: 'A' });
    const claimed = await service.claimNext('agent-1');
    expect(await service.claimNext('agent-2')).toBeNull();

    await ProvisioningJob.updateOne(
      { _id: claimed!.id },
      { $set: { claimedAt: new Date(Date.now() - 10 * 60 * 1000) } },
    );
    expect(await service.claimNext('agent-2')).not.toBeNull();
  });

  it('404s a report for a job that does not exist', async () => {
    await expect(service.report('000000000000000000000000', { ok: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.report('not-an-id', { ok: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('StationsService', () => {
  const provision = new ProvisionService();
  const stations = new StationsService(provision);
  const actor = { userId: new Types.ObjectId().toString(), email: 'ops@test.invalid' };
  let orgId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const org = await Organization.create({
      name: `Prov Co ${Date.now()}`, slug: `prov-co-${Date.now()}`,
      contactEmail: 'p@test.invalid', country: 'AU', timezone: 'UTC',
      uploadFolder: `Prov Co ${Date.now()}`,
    });
    orgId = String(org._id);
  });

  afterAll(async () => {
    const oid = new Types.ObjectId(orgId);
    await StationAccount.deleteMany({ organizationId: oid });
    await Device.deleteMany({ organizationId: oid });
    await ProvisioningJob.deleteMany({ organizationId: oid });
    await Organization.deleteOne({ _id: oid });
    await mongoose.disconnect();
  });

  it('creates the mapping INACTIVE, so a half-finished provisioning is inert', async () => {
    // `resolveStation` requires isActive, so nothing can route here until the
    // agent confirms the Unix account exists.
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower One' }, actor);
    const mapping = await StationAccount.findById(made.stationAccountId).lean();

    expect(made.status).toBe('pending');
    expect(mapping!.isActive).toBe(false);
  });

  it('stores the TOWER name alone as the routing key', async () => {
    /**
     * This used to assert `<uploadFolder>/<tower>` — and the very next test
     * asserts the queued job carries only the tower, "because the customer
     * folder is the account's own home". Both were true and nobody reconciled
     * them: the key the ingest lookup uses did not match what the agent creates
     * on disk, so every properly provisioned customer got UNKNOWN_STATION on
     * every file. Only the legacy customer worked, because its `uploadFolder`
     * is empty and the two forms coincide (M24).
     *
     * The account already identifies the customer; the folder identifies the
     * station beneath it.
     */
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Two' }, actor);
    expect(made.folderPath).toBe('Tower Two');
  });

  it('lets two customers each have a folder of the same name', async () => {
    // Uniqueness is per ACCOUNT, not global: separate chroots, separate places.
    // A global check would refuse the second customer's "Demo Tower".
    const stamp = Date.now();
    const other = await Organization.create({
      name: `Second ${stamp}`,
      slug: `second-${stamp}`,
      timezone: 'UTC',
      uploadFolder: `second-${stamp}`,
      country: 'AU',
      contactEmail: `second-${stamp}@test.invalid`,
    });
    const a = await stations.provisionStation({ organizationId: orgId, towerName: 'Shared Name' }, actor);
    const b = await stations.provisionStation({ organizationId: String(other._id), towerName: 'Shared Name' }, actor);
    expect(a.folderPath).toBe('Shared Name');
    expect(b.folderPath).toBe('Shared Name');
    expect(a.account).not.toBe(b.account);
  });

  it('queues a job carrying only the TOWER name, not the full path', async () => {
    // The customer folder is the account's own home, created by the same job —
    // passing the joined path would make the agent build a nested duplicate.
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Three' }, actor);
    const job = await ProvisioningJob.findById(made.jobId).lean();
    expect(job!.args.folder).toBe('Tower Three');
    expect(job!.args.account).toBe(made.account);
  });

  it('activates the mapping when the agent reports success', async () => {
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Four' }, actor);
    const job = await ProvisioningJob.findById(made.jobId).lean();

    await stations.onJobSucceeded({ type: job!.type, args: job!.args });
    expect((await StationAccount.findById(made.stationAccountId).lean())!.isActive).toBe(true);
  });

  it('does NOT activate on an unrelated job type', async () => {
    // `rotateStationPassword` WITH a station id is the restore path and does
    // activate — deliberately. Anything else must not.
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Five' }, actor);
    await stations.onJobSucceeded({
      type: 'disableStationAccount',
      args: { stationAccountId: made.stationAccountId },
    });
    expect((await StationAccount.findById(made.stationAccountId).lean())!.isActive).toBe(false);
  });

  it('does not activate on a rotation that carries NO station id', async () => {
    // A plain password rotation must leave a revoked station revoked.
    const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Five B' }, actor);
    await stations.onJobSucceeded({ type: 'rotateStationPassword', args: { account: made.account } });
    expect((await StationAccount.findById(made.stationAccountId).lean())!.isActive).toBe(false);
  });

  it('REFUSES a second station on the same folder', async () => {
    // Two stations sharing a folder would route one tower's readings to the other.
    await stations.provisionStation({ organizationId: orgId, towerName: 'Tower Six' }, actor);
    await expect(
      stations.provisionStation({ organizationId: orgId, towerName: 'Tower Six' }, actor),
    ).rejects.toMatchObject({ code: 'DUPLICATE_FOLDER' });
  });

  it('refuses an injected tower name before anything is created', async () => {
    const before = await StationAccount.countDocuments({ organizationId: new Types.ObjectId(orgId) });
    await expect(
      stations.provisionStation({ organizationId: orgId, towerName: '../../etc' }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await StationAccount.countDocuments({ organizationId: new Types.ObjectId(orgId) })).toBe(before);
  });

  it('refuses a reserved Unix account name', async () => {
    await expect(
      stations.provisionStation({ organizationId: orgId, towerName: 'Tower Seven', account: 'root' }, actor),
    ).rejects.toMatchObject({ code: 'RESERVED_ACCOUNT_NAME' });
  });

  it('404s an unknown customer', async () => {
    await expect(
      stations.provisionStation({ organizationId: '000000000000000000000000', towerName: 'X' }, actor),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reports isActive as the truth, with the job status explaining a pending one', async () => {
    const list = await stations.list(orgId);
    const pending = list.find((s) => !s.isActive);
    expect(pending?.status).not.toBe('active');
    const active = list.find((s) => s.isActive);
    if (active) expect(active.status).toBe('active');
  });

  describe('rotation, revocation and restore', () => {
    let stationId: string;

    beforeEach(async () => {
      const made = await stations.provisionStation(
        { organizationId: orgId, towerName: `Tower ${Date.now().toString(36)}` },
        actor,
      );
      stationId = made.stationAccountId;
      await StationAccount.updateOne({ _id: stationId }, { $set: { isActive: true } });
    });

    it('queues a rotation without touching routing', async () => {
      // Rotating a password does not stop the station working — the old session
      // continues, the next one uses the new password.
      const r = await stations.rotatePassword(stationId, actor);
      expect(r.status).toBe('pending');
      expect((await StationAccount.findById(stationId).lean())!.isActive).toBe(true);
    });

    it('REVOKES routing immediately, before the agent runs', async () => {
      // Revocation is what happens when a station is compromised. Waiting for a
      // queue poll to stop accepting its data would be the wrong way round.
      await stations.revokeStation(stationId, actor);
      expect((await StationAccount.findById(stationId).lean())!.isActive).toBe(false);
    });

    it('locks rather than deletes, so the uploaded files survive', async () => {
      const r = await stations.revokeStation(stationId, actor);
      const job = await ProvisioningJob.findById(r.jobId).lean();
      expect(job!.type).toBe('disableStationAccount');
      // The mapping is still there — revoked, not erased.
      expect(await StationAccount.findById(stationId).lean()).not.toBeNull();
    });

    it('does not reactivate on a plain rotation', async () => {
      await stations.revokeStation(stationId, actor);
      const r = await stations.rotatePassword(stationId, actor);
      const job = await ProvisioningJob.findById(r.jobId).lean();

      await stations.onJobSucceeded({ type: job!.type, args: job!.args });
      expect((await StationAccount.findById(stationId).lean())!.isActive).toBe(false);
    });

    it('reactivates on a RESTORE, which carries the station id', async () => {
      await stations.revokeStation(stationId, actor);
      const r = await stations.restoreStation(stationId, actor);
      const job = await ProvisioningJob.findById(r.jobId).lean();

      await stations.onJobSucceeded({ type: job!.type, args: job!.args });
      expect((await StationAccount.findById(stationId).lean())!.isActive).toBe(true);
    });

    it('restores by ROTATING, so the revoked password does not come back', async () => {
      await stations.revokeStation(stationId, actor);
      const r = await stations.restoreStation(stationId, actor);
      expect((await ProvisioningJob.findById(r.jobId).lean())!.type).toBe('rotateStationPassword');
    });

    it('404s an unknown station', async () => {
      await expect(stations.rotatePassword('000000000000000000000000', actor)).rejects.toMatchObject({ statusCode: 404 });
      await expect(stations.revokeStation('not-an-id', actor)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('the one-read password', () => {
    let jobId: string;

    beforeEach(async () => {
      const made = await stations.provisionStation(
        { organizationId: orgId, towerName: `Secret ${Date.now().toString(36)}` },
        actor,
      );
      const claimed = await provision.claimNext('agent-1');
      jobId = claimed!.id;
      await provision.report(jobId, {
        ok: true,
        result: { account: made.account, home: '/home/x', password: 'sup3r-s3cret' },
      });
    });

    it('is NOT in the stored result', async () => {
      const job = await ProvisioningJob.findById(jobId).lean();
      expect(JSON.stringify(job!.result)).not.toContain('sup3r-s3cret');
    });

    it('is returned exactly once', async () => {
      expect(await provision.collectSecret(jobId)).toBe('sup3r-s3cret');
      // A second operator, or a second click, gets nothing.
      expect(await provision.collectSecret(jobId)).toBeNull();
    });

    it('is gone from the document after collection', async () => {
      await provision.collectSecret(jobId);
      const job = await ProvisioningJob.findById(jobId).lean();
      expect(job!.secretOnce).toBeNull();
      expect(job!.secretExpiresAt).toBeNull();
    });

    it('expires even if nobody collects it', async () => {
      await ProvisioningJob.updateOne({ _id: jobId }, { $set: { secretExpiresAt: new Date(Date.now() - 1000) } });
      expect(await provision.collectSecret(jobId)).toBeNull();
    });

    it('does NOT delete the job — the audit trail outlives the secret', async () => {
      // A TTL index on `secretExpiresAt` would erase the whole document, which is
      // why expiry is enforced on read instead.
      await ProvisioningJob.updateOne({ _id: jobId }, { $set: { secretExpiresAt: new Date(Date.now() - 1000) } });
      await provision.collectSecret(jobId);
      expect(await ProvisioningJob.findById(jobId).lean()).not.toBeNull();
    });

    it('returns null for an unknown or malformed job id', async () => {
      expect(await provision.collectSecret('000000000000000000000000')).toBeNull();
      expect(await provision.collectSecret('not-an-id')).toBeNull();
    });
  });

  describe('disk usage', () => {
    it('records what the agent reports, without enforcing a quota', async () => {
      // Reported, not enforced: refusing an upload would lose data at the source,
      // and the files are retained permanently by instruction.
      const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Usage Tower' }, actor);
      await stations.onJobSucceeded({
        type: 'reportStationUsage',
        args: { account: made.account },
        result: { bytes: 1_234_567 },
      });

      const mapping = await StationAccount.findById(made.stationAccountId).lean();
      expect(mapping!.diskUsageBytes).toBe(1_234_567);
      expect(mapping!.diskUsageAt).toBeTruthy();
    });

    it('ignores a nonsense figure rather than storing it', async () => {
      const made = await stations.provisionStation({ organizationId: orgId, towerName: 'Usage Bad' }, actor);
      await stations.onJobSucceeded({
        type: 'reportStationUsage',
        args: { account: made.account },
        result: { bytes: 'lots' },
      });
      expect((await StationAccount.findById(made.stationAccountId).lean())!.diskUsageBytes).toBeNull();
    });
  });
});

/**
 * CROSS-LAYER CONTRACT (M21 W4 security review).
 *
 * The same corpus is asserted in `provision-agent/src/cross-layer.test.ts`.
 * Three layers validate provisioning arguments — this API, the queue service,
 * and the agent before it invokes root — and they are only defence in depth if
 * they AGREE. A divergence is a finding either way round: an inner layer looser
 * than an outer one means the outer check was the only thing stopping it; an
 * inner layer stricter means jobs queue and then fail forever.
 *
 * If this table is edited, edit it in both places.
 */
const ACCOUNT_CASES: [string, boolean][] = [
  ['wx-acme-01', true],
  ['wx_acme', true],
  ['abc', true],
  ['a'.repeat(32), true],
  ['ab', false],
  ['a'.repeat(33), false],
  ['1acme', false],
  ['-acme', false],
  ['Acme', false],
  ['root', false],
  ['sshd', false],
  ['wxstation', false],
  ['wx acme', false],
  ['wx;rm -rf /', false],
  ['wx&&id', false],
  ['wx|cat', false],
  ['wx$(id)', false],
  ['wx`id`', false],
  ['wx>out', false],
  ['wx/acme', false],
  ['../etc/passwd', false],
  ['wx\nacme', false],
  ['wx\0acme', false],
];

const FOLDER_CASES: [string, boolean][] = [
  ['Demo Tower', true],
  ['Tower_02-B', true],
  ['Site 3', true],
  ['A.B', true],
  ['a/b', false],
  ['a\\b', false],
  ['..', false],
  ['a/../b', false],
  ['.hidden', false],
  [' Tower', false],
  ['Tower ', false],
  ['Tower;id', false],
  ['Tower$(id)', false],
  ['Tower|x', false],
  ['Tower&', false],
  ['-rf', false],
  ['', false],
];

describe('cross-layer contract with the agent', () => {
  // Its own connection: the describe above disconnects in `afterAll`, and this
  // block runs after it.
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    }
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it.each(ACCOUNT_CASES)('account %j → %s', (name, expected) => {
    expect(isValidAccountName(name)).toBe(expected);
  });

  it.each(FOLDER_CASES)('folder %j → %s', (name, expected) => {
    expect(isValidFolderSegment(name)).toBe(expected);
  });

  it('the QUEUE agrees with the validators it is built on', async () => {
    // The service is the second layer. If it accepted something the validators
    // refuse — or refused something they accept — the layers would not be
    // checking the same thing.
    const svc = new ProvisionService();
    const ORG = new Types.ObjectId().toString();

    for (const [name, expected] of ACCOUNT_CASES) {
      const attempt = svc.queue({
        organizationId: ORG,
        type: 'disableStationAccount',
        args: { account: name },
      });
      if (expected) {
        const job = await attempt;
        expect(job.args.account).toBe(name);
        await ProvisioningJob.deleteOne({ _id: job.id });
      } else {
        await expect(attempt).rejects.toMatchObject({ statusCode: 400 });
      }
    }
  });
});
