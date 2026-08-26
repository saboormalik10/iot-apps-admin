/**
 * Replay a day of station files at 60× and watch the cost per file.
 *
 * A real station writes one file a minute, 1,440 a day, 60 readings each. At 60×
 * that is one file a second — and the question is whether the per-file cost
 * stays FLAT as the day fills, or creeps up as the day record and its measures
 * accumulate.
 *
 * That creep is exactly what the M23 W1 index fix addressed: the day lookup used
 * to scan every record for the device. A functional test cannot see it, because
 * a slow ingest is still a correct ingest.
 *
 *   npx ts-node src/scripts/load-test-ingest.ts [--files 1440]
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { IngestService } from '../ingest/ingest.service';
import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import { MetIngestFile } from '../models/MetIngestFile';
import { Device } from '../models/Device';
import { Organization } from '../models/Organization';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) || fallback : fallback;
};

const FILES = arg('files', 1440);
const ROWS_PER_FILE = 60;
/** Report the curve at these points through the day. */
const BUCKETS = 6;

const percentile = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/** One minute of readings, in the station's own format. */
function fileFor(minute: number, dayStartMs: number): string {
  const rows = ['timestamp,direction,speed,units,status'];
  for (let s = 0; s < ROWS_PER_FILE; s += 1) {
    const ts = new Date(dayStartMs + minute * 60_000 + s * 1000);
    rows.push(`${ts.toISOString()},${(minute * 7 + s) % 360},0.${50 + (s % 40)},K,A`);
  }
  return rows.join('\r\n') + '\r\n';
}

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  const org = await Organization.findOne({ deletedAt: null }).lean();
  if (!org) throw new Error('No organisation to attach the scratch station to');

  const device = await Device.create({
    organizationId: org._id, name: 'REPLAY scratch', type: 'MET-LINK', bleId: `replay-${Date.now()}`,
  });
  const deviceId = String(device._id);
  const orgId = String(org._id);

  // Events are swallowed: this measures the ingest write path, not the gateway.
  const service = new IngestService({ emit: () => undefined } as never);

  // Start of today, so all rows land on one local day — the worst case for the
  // day record, which is the thing being stressed.
  const dayStartMs = new Date().setUTCHours(0, 0, 0, 0);

  console.log(`• replaying ${FILES.toLocaleString()} files × ${ROWS_PER_FILE} rows at 60× (one file per simulated second)\n`);
  console.log('  through the day   files    p50       p95       max      rows so far');
  console.log('  ───────────────   ─────    ───────   ───────   ──────   ───────────');

  const perFileMs: number[] = [];
  const bucketSize = Math.ceil(FILES / BUCKETS);
  let bucket: number[] = [];
  const curve: Array<{ upTo: number; p95: number }> = [];

  for (let i = 0; i < FILES; i += 1) {
    const content = fileFor(i, dayStartMs);
    const t0 = process.hrtime.bigint();
    await service.ingestForDevice(orgId, deviceId, `REPLAY_${String(i).padStart(4, '0')}.csv`, content);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;

    perFileMs.push(ms);
    bucket.push(ms);

    if (bucket.length >= bucketSize || i === FILES - 1) {
      const p95 = percentile(bucket, 95);
      curve.push({ upTo: i + 1, p95 });
      console.log(
        `  ${String(Math.round(((i + 1) / FILES) * 100)).padStart(14)}%   ${String(bucket.length).padStart(5)}` +
          `    ${percentile(bucket, 50).toFixed(0).padStart(4)} ms   ${p95.toFixed(0).padStart(4)} ms` +
          `   ${Math.max(...bucket).toFixed(0).padStart(4)} ms   ${((i + 1) * ROWS_PER_FILE).toLocaleString().padStart(11)}`,
      );
      bucket = [];
    }
  }

  const firstP95 = curve[0].p95;
  const lastP95 = curve[curve.length - 1].p95;
  const drift = lastP95 / firstP95;

  console.log(`\n  p95 first bucket ${firstP95.toFixed(0)} ms → last bucket ${lastP95.toFixed(0)} ms  (${drift.toFixed(2)}×)`);
  if (drift > 1.5) {
    console.log('  ❌ RISING — per-file cost grows as the day fills. Check the day-record lookup plan.');
  } else {
    console.log('  ✅ FLAT — per-file cost does not depend on how full the day already is');
  }

  const throughput = 1000 / percentile(perFileMs, 50);
  console.log(`\n  sustained ${throughput.toFixed(1)} files/sec at the median`);
  console.log(`  a real station sends 1 file/minute → one server can carry ~${Math.floor(throughput * 60).toLocaleString()} stations on this path`);

  await MetMeasure.deleteMany({ deviceId: new Types.ObjectId(deviceId) });
  await MetRecord.deleteMany({ deviceId: new Types.ObjectId(deviceId) });
  await MetIngestFile.deleteMany({ deviceId: new Types.ObjectId(deviceId) });
  await Device.deleteOne({ _id: device._id });
  console.log('\n  scratch removed');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
