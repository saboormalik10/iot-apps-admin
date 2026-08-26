/**
 * Backfill `Organization.uploadFolder` for customers created before M19 W4.
 *
 * The folder is the customer's identity on disk — station folders live beneath
 * it as `<uploadFolder>/<Tower>` — so a customer without one cannot have
 * stations provisioned.
 *
 * THE LEGACY FLAT CUSTOMER KEEPS `''`. Whoever owns a `StationAccount` with
 * `folderPath: ''` is genuinely uploading to the root today; inventing a folder
 * name for them would describe a directory that does not exist and would not
 * match `StationAccount.folderPath`, which is what actually routes the data.
 *
 *   npx ts-node src/scripts/migrate-org-upload-folder.ts [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { Organization } from '../models/Organization';
import { StationAccount } from '../models/StationAccount';
import { normaliseFolderPath, isSafeFolderPath } from '../ingest/folder-path';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  console.log(`• ${mongoose.connection.name}  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const flatOwners = new Set(
    (await StationAccount.find({ folderPath: '', isActive: true }).select('organizationId').lean()).map((s) =>
      String(s.organizationId),
    ),
  );

  const orgs = await Organization.find({ deletedAt: null }).select('name uploadFolder').lean();
  const taken = new Set(orgs.map((o) => o.uploadFolder).filter(Boolean) as string[]);

  for (const org of orgs) {
    const id = String(org._id);
    if (org.uploadFolder) {
      console.log(`  ·  ${org.name.padEnd(30)} already ${JSON.stringify(org.uploadFolder)}`);
      continue;
    }
    if (flatOwners.has(id)) {
      console.log(`  ·  ${org.name.padEnd(30)} uploads to the ROOT today — left as "" deliberately`);
      continue;
    }

    let folder = normaliseFolderPath(org.name);
    if (!isSafeFolderPath(folder) || folder.includes('/')) folder = folder.replace(/[^\w .\-()]/g, ' ').trim();
    // Two customers sharing a folder would route one's data to the other.
    let candidate = folder;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${folder} ${n}`;
    taken.add(candidate);

    console.log(`  ✅ ${org.name.padEnd(30)} → ${JSON.stringify(candidate)}`);
    if (APPLY) await Organization.updateOne({ _id: org._id }, { $set: { uploadFolder: candidate } });
  }

  if (!APPLY) console.log('\n  Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
