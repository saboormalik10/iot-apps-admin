import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { randomBytes } from 'crypto';

import { Organization } from '../models/Organization';
import { ServiceCredential } from '../models/ServiceCredential';
import { hashToken } from '../common/guards/service-credential.guard';

/**
 * Mint the PROVISIONING credential for the agent that creates SFTP accounts.
 *
 * Deliberately separate from the ingest credential, even though both live on the
 * same box: the ingest token only uploads file bytes, while this one drives
 * `useradd` as root. `ProvisionCredentialGuard` rejects an ingest token on a
 * provisioning route with 403 — valid credential, wrong kind — so a leak of the
 * busier token cannot create Unix accounts.
 *
 * `provision-station.ts` mints the INGEST token; this is its counterpart, and it
 * was missing until the agent was first deployed (M24).
 *
 *   npm run mint:provision-token
 *
 * Printed once. Only the sha256 is stored.
 */
function mintProvisionToken(): { token: string; prefix: string } {
  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  return { token: `obsp_${prefix}_${secret}`, prefix };
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  const org = await Organization.findOne({ deletedAt: null }).lean();
  if (!org) throw new Error('No organization found');

  const agentId = process.argv.includes('--agent') ? process.argv[process.argv.indexOf('--agent') + 1] : 'wxbox-1';
  const { token, prefix } = mintProvisionToken();

  await ServiceCredential.create({
    organizationId: org._id as Types.ObjectId,
    name: `provision-agent (${agentId})`,
    kind: 'provision',
    tokenPrefix: prefix,
    tokenHash: hashToken(token),
    allowedCidrs: [],
  });

  console.log(`• Organization: ${org.name}`);
  console.log(`• Agent id:     ${agentId}\n`);
  console.log('── PROVISIONING CREDENTIAL — shown once, only its hash is stored ──');
  console.log(`  ${token}`);
  console.log('\n  Put it on the box as:');
  console.log('    /etc/observator/provision-agent.env   (0640 root:obsprov)');
  console.log(`    OBSERVATOR_PROVISION_TOKEN=${token}`);
  console.log('\n  ⚠️  This token can create Unix accounts. Do not commit it.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
