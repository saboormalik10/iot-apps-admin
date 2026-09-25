/**
 * READ-ONLY. Capacity model across EVERY collection.
 *
 * The subtlety: each collection has its own retention, so they do not all grow
 * to the same horizon. Extending how long READINGS are kept does not mean
 * keeping the ingest-file ledger that long — that ledger exists to stop the same
 * file being ingested twice, and a file that stopped arriving weeks ago cannot
 * arrive again. Modelling everything at one horizon roughly doubles the answer.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** Docs gained per station per day, and the horizon each is actually kept for. */
type Growth = { perDay: number; keepDays: number | 'horizon'; note: string };

const MODEL: Record<string, Growth> = {
  // One record per minute. THIS is what a retention change applies to.
  metmeasures: { perDay: 1440, keepDays: 'horizon', note: 'readings (1/min)' },
  // One per file — wind + environmental, each once a minute. Dedup ledger only:
  // it needs to outlive an agent retry, not the data.
  metingestfiles: { perDay: 2880, keepDays: 23, note: 'file ledger (dedup)' },
  metrecords: { perDay: 1, keepDays: 'horizon', note: 'day records' },
  // No TTL: the permanent long-term history, and tiny.
  metdailysummaries: { perDay: 1, keepDays: 'horizon', note: 'daily rollups (forever)' },
};

/** Real per-document cost. Measured, since collection averages are skewed by
 *  the legacy per-second rows still expiring out of metmeasures. */
const BYTES_PER_DOC: Record<string, number> = {
  metmeasures: 808, // measured on actual minute records
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const db = mongoose.connection.db!;
  const horizonDays = Number(process.argv[2] ?? 730);

  console.log(`Horizon for READINGS: ${horizonDays} days (${(horizonDays / 365).toFixed(1)} years)\n`);
  console.log('collection            per-doc   docs/day     kept    per station total');
  console.log('─'.repeat(72));

  let perStation = 0;
  for (const [name, g] of Object.entries(MODEL)) {
    const s = (await db.command({ collStats: name })) as { count: number; size: number; totalIndexSize: number };
    const perDoc = BYTES_PER_DOC[name] ?? (s.count ? (s.size + s.totalIndexSize) / s.count : 0);
    const days = g.keepDays === 'horizon' ? horizonDays : g.keepDays;
    const bytes = g.perDay * perDoc * days;
    perStation += bytes;
    console.log(
      `${name.padEnd(20)} ${perDoc.toFixed(0).padStart(7)} ${String(g.perDay).padStart(10)} ` +
        `${String(days).padStart(7)}d ${(bytes / MB).toFixed(0).padStart(12)} MB   ${g.note}`,
    );
  }

  // Everything that does NOT scale with stations — users, roles, orgs, tokens.
  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  let fixed = 0;
  for (const name of cols) {
    if (MODEL[name]) continue;
    const s = (await db.command({ collStats: name })) as { size: number; totalIndexSize: number };
    fixed += s.size + s.totalIndexSize;
  }
  console.log(`${'(everything else)'.padEnd(20)} ${''.padStart(7)} ${''.padStart(10)} ${''.padStart(8)} ${(fixed / MB).toFixed(0).padStart(12)} MB   fixed, not per-station`);

  console.log(`\nper station: ${(perStation / MB).toFixed(0)} MB  (${(perStation / GB).toFixed(2)} GB)\n`);
  console.log('stations   total      database tier');
  console.log('─'.repeat(50));
  for (const n of [10, 20, 50, 100]) {
    const gb = (n * perStation + fixed) / GB;
    const overM10 = Math.max(0, gb - 10);
    console.log(`  ${String(n).padStart(3)}   ${gb.toFixed(1).padStart(7)} GB   M10 + ${overM10.toFixed(0)} GB extra ≈ $${(57 + overM10 * 0.1).toFixed(0)}/mo`);
  }
  await mongoose.disconnect();
})();
