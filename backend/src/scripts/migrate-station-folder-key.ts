import 'dotenv/config';
import mongoose from 'mongoose';
import { StationAccount } from '../models/StationAccount';
import { Organization } from '../models/Organization';

/**
 * Strip the customer prefix from `StationAccount.folderPath`.
 *
 * Each customer has their own chrooted SFTP account, so the provisioning agent
 * creates `~/upload/<tower>` and the ingest agent reports the folder relative to
 * that root. The backend was storing `<org.uploadFolder>/<tower>`, so the
 * `(account, folderPath)` lookup never matched and every file from a properly
 * provisioned customer came back `UNKNOWN_STATION`.
 *
 * Only rows whose folderPath actually begins with their organisation's
 * `uploadFolder` are touched, and only when the remainder is a single segment —
 * anything else is reported and left alone rather than guessed at.
 *
 *   npm run migrate:station-folder-key -- --dry-run
 *   npm run migrate:station-folder-key
 */
async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });

  const orgs = new Map(
    (await Organization.find({}).select('name uploadFolder').lean()).map((o) => [String(o._id), o]),
  );

  let changed = 0;
  let skipped = 0;

  for (const s of await StationAccount.find({}).lean()) {
    const org = orgs.get(String(s.organizationId)) as { name?: string; uploadFolder?: string } | undefined;
    const prefix = (org?.uploadFolder ?? '').trim();
    const current = s.folderPath ?? '';

    if (!prefix || !current.startsWith(`${prefix}/`)) {
      console.log(`  ${String(s.account).padEnd(20)} "${current}" — already correct`);
      continue;
    }

    const stripped = current.slice(prefix.length + 1);
    if (stripped.includes('/')) {
      console.log(`  ${String(s.account).padEnd(20)} "${current}" — MORE THAN ONE segment left, leaving alone`);
      skipped += 1;
      continue;
    }

    // Would the result collide with an existing row for the same account?
    const clash = await StationAccount.findOne({
      _id: { $ne: s._id },
      account: s.account,
      folderPath: stripped,
    }).lean();
    if (clash) {
      console.log(`  ${String(s.account).padEnd(20)} "${current}" → "${stripped}" WOULD COLLIDE, leaving alone`);
      skipped += 1;
      continue;
    }

    console.log(`  ${String(s.account).padEnd(20)} "${current}" → "${stripped}"`);
    if (!dryRun) await StationAccount.updateOne({ _id: s._id }, { $set: { folderPath: stripped } });
    changed += 1;
  }

  console.log(`\n  ${dryRun ? 'would change' : 'changed'}: ${changed}   skipped: ${skipped}`);
  if (dryRun) console.log('  DRY RUN — nothing was written.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
