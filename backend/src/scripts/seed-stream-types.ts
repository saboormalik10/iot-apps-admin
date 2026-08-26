/**
 * Seed the built-in stream types.
 *
 * A row here is METADATA — it does not create a parser. The parser lives in the
 * registry, in code; this row is what an operator sees and toggles. `parserKey`
 * must name a registered parser, and the script refuses to seed one that does
 * not exist rather than creating a type that fails only at ingest time.
 *
 *   npx ts-node src/scripts/seed-stream-types.ts [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { StreamType } from '../models/StreamType';
import { listStreamParsers } from '../ingest/registry';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  console.log(`• ${mongoose.connection.name}  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  for (const parser of listStreamParsers()) {
    const existing = await StreamType.findOne({ key: parser.key, organizationId: null, deletedAt: null }).lean();
    if (existing) {
      console.log(`  ·  ${parser.key.padEnd(14)} already present`);
      continue;
    }
    console.log(`  ✅ ${parser.key.padEnd(14)} ${parser.label}`);
    if (APPLY) {
      await StreamType.create({
        key: parser.key,
        parserKey: parser.key,
        name: parser.label,
        description: parser.description,
        organizationId: null,
        isEnabled: true,
        isBuiltIn: true,
      });
    }
  }

  // A type whose parser has been removed or renamed would accept stations and
  // then reject every file. Report it rather than leave it to be discovered.
  const orphans = await StreamType.find({ deletedAt: null }).lean();
  const known = new Set(listStreamParsers().map((p) => p.key));
  for (const t of orphans) {
    if (!known.has(t.parserKey)) {
      console.log(`  ⚠️  ${t.key.padEnd(14)} points at missing parser "${t.parserKey}"`);
    }
  }

  if (!APPLY) console.log('\n  Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
