import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { randomBytes } from 'crypto';

import { Organization } from '../models/Organization';
import { ServiceCredential } from '../models/ServiceCredential';
import { StationAccount } from '../models/StationAccount';
import { ProvisioningJob } from '../models/ProvisioningJob';
import { hashToken } from '../common/guards/service-credential.guard';

/**
 * Re-deploy the per-customer ingest agent for any station that has none.
 *
 * WHY THIS EXISTS
 * `StationsService.ensureIngestAgent` deploys an agent when a customer's first
 * station is created, and now retries on the next station if that failed. But a
 * customer who already HAS their station has no reason to create another, so a
 * failed deployment needed a way back. Three customers were in exactly that
 * state: a station, an SFTP account, files arriving in `upload/`, and no agent
 * instance watching the folder.
 *
 * They failed because the agent's secret read was scoped to its credential's
 * organisation while `claimNext` hands it jobs for every customer on the box —
 * so `enableIngestAgent` returned "ingest token unavailable" on the FIRST
 * attempt for every customer but one. Fixed in `collectSecret`; this repairs the
 * jobs that were lost to it.
 *
 * WHAT IT REPAIRS, and what it deliberately REFUSES to touch.
 * Only an account whose `enableIngestAgent` job FAILED is re-deployed. An
 * account with no job history at all is left alone and reported, because the two
 * look identical in the database and are opposite in consequence: `wxstation`,
 * the one live customer, has no job history because its agent was installed by
 * hand before this pipeline existed. Its credential is in daily use. The first
 * draft of this script offered to revoke it — which would have taken the live
 * customer's ingest down to repair three test tenants. `--account <name>` forces
 * one of those by name, for the case where you know the agent really is absent.
 *
 * Per repaired account:
 *   1. Revoke the stale ingest credential. Its one-read secret is gone, so it can
 *      never reach the box, but it would still authenticate.
 *   2. Mint a fresh token, queue the job, park the token as a one-read secret for
 *      the agent — the same three steps, in the same order, as the service.
 *
 * Dry run by default. `-- --apply` to act.
 *
 *   yarn migrate:redeploy-agents
 *   yarn migrate:redeploy-agents -- --apply
 *   yarn migrate:redeploy-agents -- --apply --account wx-acme-marine
 */

const SECRET_TTL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  // Accounts to repair even though they have no failed job to point at.
  const forced = new Set(
    process.argv.reduce<string[]>((acc, arg, i) => {
      if (arg === '--account' && process.argv[i + 1]) acc.push(process.argv[i + 1]);
      return acc;
    }, []),
  );
  await mongoose.connect(process.env.MONGO_URI as string, {
    serverSelectionTimeoutMS: 15_000,
    autoIndex: false,
  });

  const orgs = (await Organization.find({}).select('name').lean()) as Array<{ _id: Types.ObjectId; name: string }>;
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));

  // One agent per ACCOUNT, not per station: a customer's second tower is another
  // folder inside the same chroot, watched by the same instance.
  const stations = (await StationAccount.find({}).select('organizationId account').lean()) as Array<{
    organizationId: Types.ObjectId;
    account: string;
  }>;
  const pairs = new Map<string, { organizationId: Types.ObjectId; account: string }>();
  for (const s of stations) pairs.set(`${String(s.organizationId)}::${s.account}`, s);

  console.log(`${pairs.size} (organisation, account) pair(s) with a station\n`);

  let repaired = 0;
  let skipped = 0;

  for (const { organizationId, account } of pairs.values()) {
    const label = `${(orgName.get(String(organizationId)) ?? '?').padEnd(28)} ${account}`;
    const forThisAccount = { organizationId, type: 'enableIngestAgent' as const, 'args.account': account };

    const [running, inFlight, failed] = await Promise.all([
      ProvisioningJob.findOne({ ...forThisAccount, status: 'succeeded' }).lean(),
      ProvisioningJob.findOne({ ...forThisAccount, status: { $in: ['queued', 'claimed'] } }).lean(),
      ProvisioningJob.findOne({ ...forThisAccount, status: 'failed' }).lean(),
    ]);

    if (running) {
      console.log(`  = ${label}  agent already deployed`);
      skipped++;
      continue;
    }
    if (inFlight) {
      console.log(`  … ${label}  deployment in flight (${inFlight.status})`);
      skipped++;
      continue;
    }
    if (!failed && !forced.has(account)) {
      // No job ever ran for this account. Could be an agent installed by hand
      // (wxstation) or a station predating the feature (created 2026-08-25).
      // Re-deploying the first would revoke a credential in live use.
      console.log(
        `  ! ${label}  no deployment has ever been attempted — LEFT ALONE.\n` +
          `      If its agent really is absent:  -- --apply --account ${account}`,
      );
      skipped++;
      continue;
    }

    const stale = await ServiceCredential.countDocuments({
      organizationId,
      kind: 'ingest',
      name: `ingest-agent (${account})`,
      revokedAt: null,
    });

    const why = failed ? `last attempt failed: ${failed.error ?? 'unknown'}` : 'forced by --account';
    console.log(
      `  → ${label}  re-deploying (${why})${stale ? `, revoking ${stale} stale credential(s)` : ''}`,
    );
    repaired++;
    if (!apply) continue;

    await ServiceCredential.updateMany(
      { organizationId, kind: 'ingest', name: `ingest-agent (${account})`, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

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

    // Queue and park in this order, and never put the token in `args`: job
    // documents are readable for 90 days and reach every backup.
    const job = await ProvisioningJob.create({
      organizationId,
      type: 'enableIngestAgent',
      args: { account },
      status: 'queued',
      createdBy: null,
    });
    await ProvisioningJob.updateOne(
      { _id: job._id },
      { $set: { secretOnce: token, secretExpiresAt: new Date(Date.now() + SECRET_TTL_MS) } },
    );
  }

  console.log(
    `\n${apply ? '✓ applied' : 'DRY RUN — nothing written'}: ${repaired} to re-deploy, ${skipped} already fine.`,
  );
  if (apply && repaired > 0) {
    console.log(
      'The agent polls every few seconds; the parked token expires in 15 minutes whether it is collected or not.\n' +
        'Confirm with:  journalctl -u observator-provision -f\n' +
        '               systemctl list-units "observator-ingest*"',
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
