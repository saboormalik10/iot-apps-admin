/**
 * One-off backfill for the daily-summary rollups (§10.7).
 *
 * Recomputes MetDailySummary for every (device, day) that has
 * history. Idempotent — safe to re-run; each day is an upsert. Going forward the
 * DailySummaryService keeps these current incrementally off ingest events.
 *
 * Run: npx ts-node src/scripts/backfill-daily-summary.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetRecord } from '../models/MetRecord';
import { DailySummaryService } from '../analytics/daily-summary.service';
import { localDayBounds, localDaysInSpan } from '../utils/tz.util';
import { Organization } from '../models/Organization';

async function backfill(): Promise<void> {
  const uri = process.env.MONGO_URI ?? '';
  if (!uri) throw new Error('MONGO_URI not set in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  const svc = new DailySummaryService();

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

  await mongoose.disconnect();
  console.log('Backfill complete.');
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
