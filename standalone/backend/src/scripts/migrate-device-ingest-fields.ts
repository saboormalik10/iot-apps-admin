import 'dotenv/config';
import mongoose from 'mongoose';
import { Device } from '../models/Device';

/**
 * Backfill the ingest fields added to Device in M14 W1.
 *
 * Mongoose schema defaults apply only to NEW documents — an existing device has
 * no `headingOffsetDeg` key at all, so it reads as `undefined` rather than 0 and
 * a query like `{ headingOffsetDeg: 0 }` will not match it. Reading code guards
 * with `?? 0`, but leaving the field absent means every future query has to
 * remember to do the same.
 *
 * Idempotent: only touches documents where the field is missing.
 *
 *   npm run migrate:device-ingest-fields
 */
async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const pending = await Device.countDocuments({ headingOffsetDeg: { $exists: false } });
  console.log(`• devices missing headingOffsetDeg: ${pending}`);

  const r1 = await Device.updateMany({ headingOffsetDeg: { $exists: false } }, { $set: { headingOffsetDeg: 0 } });
  const r2 = await Device.updateMany({ availableSensors: { $exists: false } }, { $set: { availableSensors: [] } });
  const r3 = await Device.updateMany({ sensorsUpdatedAt: { $exists: false } }, { $set: { sensorsUpdatedAt: null } });

  console.log(`  headingOffsetDeg  → ${r1.modifiedCount}`);
  console.log(`  availableSensors  → ${r2.modifiedCount}`);
  console.log(`  sensorsUpdatedAt  → ${r3.modifiedCount}`);

  const left = await Device.countDocuments({ headingOffsetDeg: { $exists: false } });
  console.log(`\n${left === 0 ? '✅' : '❌'} devices still missing the field: ${left}`);
  if (left !== 0) process.exitCode = 1;

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
