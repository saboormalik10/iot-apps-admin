import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { randomBytes } from 'crypto';

import { Organization } from '../models/Organization';
import { Device } from '../models/Device';
import { StationAccount } from '../models/StationAccount';
import { ServiceCredential } from '../models/ServiceCredential';
import { hashToken } from '../common/guards/service-credential.guard';

/**
 * Register an SFTP account as a station, and mint the ingest credential.
 *
 * This is the manual counterpart to the automated provisioning agent (M21). It
 * does the database half only — creating the Unix account on the box is separate.
 *
 * Station identity is PRE-REGISTERED here rather than inferred at ingest time. An
 * unknown account is rejected by the endpoint, so a typo'd or attacker-chosen
 * account name cannot silently create an orphan station belonging to nobody.
 *
 *   npm run provision:station -- --account wxstation --name "WindSonic — Sydney"
 *   npm run provision:station -- --account wxstation --credential-only
 *
 * The credential is printed ONCE. Only its sha256 is stored.
 */

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** `obsi_<prefix>_<secret>` — prefix is the public lookup key, secret is never stored. */
function mintIngestToken(): { token: string; prefix: string } {
  const prefix = randomBytes(6).toString('hex'); // 12 chars
  const secret = randomBytes(24).toString('hex'); // 48 chars
  return { token: `obsi_${prefix}_${secret}`, prefix };
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  const account = argValue('--account');
  if (!account) throw new Error('--account is required');
  // Same charset the provisioning script will enforce on the box. Validated here
  // too: each layer must be able to reject independently.
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(account)) {
    throw new Error(`Invalid account "${account}" — must match ^[a-z][a-z0-9_-]{2,31}$`);
  }
  const credentialOnly = process.argv.includes('--credential-only');
  const deviceName = argValue('--name') ?? `Station ${account}`;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`• Connected to ${mongoose.connection.name}\n`);

  const org = await Organization.findOne({ deletedAt: null }).lean();
  if (!org) throw new Error('No organization found');
  console.log(`• Organization: ${org.name} (${String(org._id)})`);
  console.log(`• Timezone:     ${org.timezone}\n`);

  if (!credentialOnly) {
    // Device type reuses MET-LINK: the data genuinely is MET data and lands in
    // MetMeasure, so every existing MET dashboard and analytic works unchanged.
    let device = await Device.findOne({ organizationId: org._id, bleId: account, type: 'MET-LINK', deletedAt: null });
    if (device) {
      console.log(`  • device already exists: ${String(device._id)}`);
    } else {
      device = await Device.create({
        organizationId: org._id as Types.ObjectId,
        bleId: account,
        name: deviceName,
        type: 'MET-LINK',
        isOnline: false,
      });
      console.log(`  ✅ device created: ${String(device._id)}  ${deviceName}`);
    }

    const existing = await StationAccount.findOne({ account });
    if (existing) {
      console.log(`  • station account already mapped → device ${String(existing.deviceId)}`);
    } else {
      await StationAccount.create({
        account,
        organizationId: org._id as Types.ObjectId,
        deviceId: device._id as Types.ObjectId,
        streamType: 'met-csv',
        uploadPath: '/upload',
        isActive: true,
      });
      console.log(`  ✅ station account mapped: ${account} → ${String(device._id)}`);
    }
  }

  const { token, prefix } = mintIngestToken();
  await ServiceCredential.create({
    organizationId: org._id as Types.ObjectId,
    name: `ingest-agent (${account})`,
    kind: 'ingest',
    tokenPrefix: prefix,
    tokenHash: hashToken(token),
    allowedCidrs: [],
  });

  console.log('\n── INGEST CREDENTIAL — shown once, only its hash is stored ───');
  console.log(`  ${token}`);
  console.log('\n  Put it on the Lightsail box as:');
  console.log('    /etc/observator-ingest.env   (chmod 0600, root:root)');
  console.log(`    OBSERVATOR_INGEST_TOKEN=${token}`);
  console.log('\n  ⚠️  Do not commit it. Rotate with --credential-only.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
