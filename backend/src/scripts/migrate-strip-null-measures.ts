import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Remove stored nulls from `metmeasures`.
 *
 * `default: null` in the schema made Mongoose write every sensor key on every
 * document. On a wind-only station 24 of 39 fields were explicit nulls — 850 B
 * per row against 420 B without them, so HALF the largest collection was nulls.
 * At 86,400 rows/day/station that is ~30 MB/day instead of ~15.
 *
 * The schema no longer defaults them; this cleans the rows already written.
 *
 * SAFETY: each field is unset ONLY where its value is null
 * (`updateMany({ field: null }, { $unset: … })`). A blanket `$unset` would strip
 * real readings, so the filter is what makes this non-destructive. `{field: null}`
 * also matches documents where the key is already absent, which is a harmless
 * no-op — so the script is safe to re-run.
 *
 * `source` is deliberately NOT touched: the 30-day TTL is a partial index
 * filtered on it, and rows without the key would never expire.
 *
 *   npm run migrate:strip-nulls -- --dry-run
 *   npm run migrate:strip-nulls
 */
const SENSOR_FIELDS = [
  'windSpeedMs', 'windSpeedKmh', 'windSpeedKnots', 'windSpeedRelMs', 'windSpeedTrueMs',
  'windDirRelDeg', 'windDirTrueDeg', 'tempC', 'humidityPct', 'pressureHpa',
  'precipMm', 'precipRateMmHr', 'solarWm2', 'voltageV', 'batteryVoltageV', 'currentA',
  'dewPointC', 'qnhHpa', 'qfeHpa', 'gpsLat', 'gpsLng', 'gpsAltM', 'gpsSatellites',
  'gpsHorDilution', 'gpsGeoidalSepM', 'gpsQuality', 'phoneLat', 'phoneLng',
];

/** Dead since M15 — the code stopped reading it, the rows kept carrying it. */
const DEAD_FIELDS = ['isDemoMode'];

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.db!.collection('metmeasures');

  const before = await mongoose.connection.db!.command({ collStats: 'metmeasures' });
  const total = await col.countDocuments();
  console.log(`• metmeasures: ${total.toLocaleString()} docs, ${mb(before.storageSize)} MB storage, avg ${Math.round(before.avgObjSize)} B\n`);

  let touched = 0;
  for (const field of [...SENSOR_FIELDS, ...DEAD_FIELDS]) {
    const filter = DEAD_FIELDS.includes(field)
      ? { [field]: { $exists: true } }
      : { [field]: null };

    const n = await col.countDocuments(filter);
    if (n === 0) {
      console.log(`  ${field.padEnd(18)} — nothing to do`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${field.padEnd(18)} would unset on ${n.toLocaleString()} docs`);
      touched += n;
      continue;
    }
    const res = await col.updateMany(filter, { $unset: { [field]: '' } });
    console.log(`  ${field.padEnd(18)} unset on ${res.modifiedCount.toLocaleString()} docs`);
    touched += res.modifiedCount;
  }

  if (dryRun) {
    console.log(`\n• DRY RUN — ${touched.toLocaleString()} field-removals would be applied. Nothing changed.`);
    await mongoose.disconnect();
    return;
  }

  // compact isn't available on shared Atlas tiers; storage is reclaimed as the
  // collection is written to. Report what the documents now look like.
  const sample = await col.findOne({ source: 'sftp' });
  const after = await mongoose.connection.db!.command({ collStats: 'metmeasures' });
  console.log(`\n• ${touched.toLocaleString()} field-removals applied.`);
  console.log(`  avg doc: ${Math.round(before.avgObjSize)} B → ${Math.round(after.avgObjSize)} B`);
  console.log(`  keys on a sample row: ${sample ? Object.keys(sample).length : 0}`);
  console.log('\n  NOTE: on a shared Atlas tier the freed space is reused, not returned to the OS.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
