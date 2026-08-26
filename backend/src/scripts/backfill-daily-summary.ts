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
import { localDayBounds, localDaysInSpan } from '../utils/tz.util';
import { Organization } from '../models/Organization';

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
  // Walked in LOCAL days, matching how the ingest path keys summaries. Using UTC
  // days here would write a second, differently-keyed summary for every day and
  // put the two paths permanently out of step.
  const records = await MetRecord.find({ deletedAt: null })
    .select('organizationId deviceId dateStartMs dateEndMs')
    .lean();

  const tzCache = new Map<string, string>();
  const timezoneFor = async (orgId: string): Promise<string> => {
    const hit = tzCache.get(orgId);
    if (hit) return hit;
    const org = await Organization.findById(orgId).select('timezone').lean();
    const tz = org?.timezone || 'UTC';
    tzCache.set(orgId, tz);
    return tz;
  };

  const metSeen = new Set<string>();
  let metWritten = 0;
  let metCandidates = 0;
  for (const r of records) {
    const orgId = String(r.organizationId);
    const deviceId = String(r.deviceId);
    const tz = await timezoneFor(orgId);
    for (const dayKey of localDaysInSpan(r.dateStartMs, r.dateEndMs ?? r.dateStartMs, tz)) {
      const key = `${deviceId}|${dayKey}`;
      if (metSeen.has(key)) continue;
      metSeen.add(key);
      metCandidates++;
      const { startMs, endMs } = localDayBounds(dayKey, tz);
      const res = await svc.populateMetDay(orgId, deviceId, startMs, endMs, dayKey);
      if (res) metWritten++;
    }
  }
  console.log(`MET:  ${metWritten} day-summaries written across ${metCandidates} candidate local days.`);

  // ── NEP ──
  const sessions = await NepSession.find({ deletedAt: null })
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
