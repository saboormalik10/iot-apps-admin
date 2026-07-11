/**
 * One-off backfill for the daily-summary rollups (§10.7).
 *
 * Recomputes MetDailySummary / NepDailySummary for every (device, day) that has
 * history. Idempotent — safe to re-run; each day is an upsert. Going forward the
 * DailySummaryService keeps these current incrementally off ingest events.
 *
 * Run: npx ts-node src/scripts/backfill-daily-summary.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetRecord } from '../models/MetRecord';
import { NepSession } from '../models/NepSession';
import { DailySummaryService } from '../analytics/daily-summary.service';
import { daysInSpan } from '../analytics/daily-summary.util';

/** Collect the unique (orgId, deviceId, dayStartMs) triples from a list of spans. */
function collectDays(
  spans: Array<{ organizationId: unknown; deviceId: unknown; fromMs: number; toMs: number }>,
): Array<{ orgId: string; deviceId: string; dayStartMs: number }> {
  const seen = new Map<string, { orgId: string; deviceId: string; dayStartMs: number }>();
  for (const s of spans) {
    const orgId = String(s.organizationId);
    const deviceId = String(s.deviceId);
    for (const dayStartMs of daysInSpan(s.fromMs, s.toMs)) {
      seen.set(`${deviceId}|${dayStartMs}`, { orgId, deviceId, dayStartMs });
    }
  }
  return [...seen.values()];
}

async function backfill(): Promise<void> {
  const uri = process.env.MONGO_URI ?? '';
  if (!uri) throw new Error('MONGO_URI not set in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  const svc = new DailySummaryService();

  // ── MET ──
  const records = await MetRecord.find({ deletedAt: null, isDemoMode: false })
    .select('organizationId deviceId dateStartMs dateEndMs')
    .lean();
  const metDays = collectDays(
    records.map((r) => ({
      organizationId: r.organizationId,
      deviceId: r.deviceId,
      fromMs: r.dateStartMs,
      toMs: r.dateEndMs ?? r.dateStartMs,
    })),
  );
  let metWritten = 0;
  for (const d of metDays) {
    const res = await svc.populateMetDay(d.orgId, d.deviceId, d.dayStartMs);
    if (res) metWritten++;
  }
  console.log(`MET:  ${metWritten} day-summaries written across ${metDays.length} candidate days.`);

  // ── NEP ──
  const sessions = await NepSession.find({ deletedAt: null, isDemoMode: false })
    .select('organizationId deviceId startTimestamp endTimestamp')
    .lean();
  const nepDays = collectDays(
    sessions.map((s) => ({
      organizationId: s.organizationId,
      deviceId: s.deviceId,
      fromMs: s.startTimestamp,
      toMs: s.endTimestamp ?? s.startTimestamp,
    })),
  );
  let nepWritten = 0;
  for (const d of nepDays) {
    const res = await svc.populateNepDay(d.orgId, d.deviceId, d.dayStartMs);
    if (res) nepWritten++;
  }
  console.log(`NEP:  ${nepWritten} day-summaries written across ${nepDays.length} candidate days.`);

  await mongoose.disconnect();
  console.log('Backfill complete.');
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
