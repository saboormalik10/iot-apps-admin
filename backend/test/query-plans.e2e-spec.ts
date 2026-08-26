import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Query-plan guards (M23 W1).
 *
 * These assert HOW the database answers the hot queries, not just that it does.
 * A missing or ineligible index does not fail a functional test — it just makes
 * everything slower as data accumulates, which is invisible on a dev dataset and
 * catastrophic at 50 stations.
 *
 * The one that motivated this file: `metrecords {deviceId, dayKey}` is UNIQUE
 * PARTIAL on `{dayKey: {$type: 'string'}}`, and MongoDB will not use a partial
 * index unless the query provably matches its filter. An equality on a string
 * literal does NOT satisfy `$type`, so the planner never considered it and the
 * ingest lookup scanned every day record for the device instead.
 */

jest.setTimeout(60_000);

/** Deepest index name in a winning plan, or null for a collection scan. */
function indexOf(node: unknown): string | null {
  const n = node as { indexName?: string; inputStage?: unknown; inputStages?: unknown[] } | null;
  if (!n) return null;
  if (n.indexName) return n.indexName;
  return indexOf(n.inputStage) ?? (n.inputStages ?? []).map(indexOf).find(Boolean) ?? null;
}

async function plan(collection: string, filter: object, sort?: object) {
  const db = mongoose.connection.db!;
  let cur = db.collection(collection).find(filter as never);
  if (sort) cur = cur.sort(sort as never);
  const explained = (await cur.explain('executionStats')) as {
    queryPlanner: { winningPlan: Record<string, unknown> };
    executionStats: { totalDocsExamined: number; totalKeysExamined: number; nReturned: number };
  };
  const w = explained.queryPlanner.winningPlan;
  return {
    index: indexOf((w.queryPlan as unknown) ?? w),
    ...explained.executionStats,
  };
}

// FILE level, not per-describe: a describe that disconnects in its own
// `afterAll` leaves every later block in the file without a connection.
let deviceId: unknown;
let organizationId: unknown;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  const device = await mongoose.connection.db!.collection('devices').findOne({});
  deviceId = device!._id;
  organizationId = device!.organizationId;
});
afterAll(async () => mongoose.disconnect());

describe('hot query plans', () => {

  it('the INGEST day lookup is a point read, not a scan of the device history', async () => {
    // The hottest read in the system: once per uploaded file, 1,440 times per
    // station per day. Scanning here is ~365 keys after a year, per lookup.
    const p = await plan('metrecords', { deviceId, dayKey: '2026-08-26', deletedAt: null });
    expect(p.index).toBe('deviceId_1_dayKey_1_deletedAt_1');
    expect(p.totalKeysExamined).toBeLessThanOrEqual(Math.max(1, p.nReturned));
  });

  it('the content-hash dedup is indexed', async () => {
    // Runs on every file, before anything is parsed.
    const p = await plan('metingestfiles', {
      organizationId,
      deviceId,
      contentSha256: 'a'.repeat(64),
    });
    expect(p.index).toBe('organizationId_1_deviceId_1_contentSha256_1');
    expect(p.totalDocsExamined).toBe(0);
  });

  it('the station resolve is indexed on (account, folderPath)', async () => {
    const p = await plan('stationaccounts', { account: 'wxstation', folderPath: '', isActive: true });
    expect(p.index).toBe('account_1_folderPath_1');
  });

  it('the device list never scans the collection', async () => {
    const p = await plan('devices', { organizationId, type: 'MET-LINK', deletedAt: null });
    expect(p.index).toBeTruthy();
  });

  it('measures within a record are read in timestamp order from one index', async () => {
    const record = await mongoose.connection.db!.collection('metrecords').findOne({});
    if (!record) return;
    const p = await plan('metmeasures', { recordId: record._id, rowType: 'data' }, { timestampMs: -1 });
    // A sort served by the index, not an in-memory SORT stage.
    expect(p.index).toBe('recordId_1_rowType_1_timestampMs_-1');
  });
});

describe('index hygiene', () => {
  const isPrefixOf = (a: Record<string, number>, b: Record<string, number>): boolean => {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length >= kb.length) return false;
    return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
  };

  it('carries no index that is a redundant prefix of another', async () => {
    // A non-unique prefix index can never be the better plan, but it is still a
    // write on every insert — 4.3M a day at 50 stations, on metmeasures.
    const db = mongoose.connection.db!;
    for (const name of ['metmeasures', 'metrecords', 'devices', 'metdailysummaries']) {
      const indexes = (await db.collection(name).indexes()) as Array<{
        name?: string;
        key: Record<string, number>;
        unique?: boolean;
        partialFilterExpression?: unknown;
        expireAfterSeconds?: number;
      }>;

      for (const a of indexes) {
        for (const b of indexes) {
          if (a.name === b.name) continue;
          // A unique or partial or TTL index is never merely redundant — it
          // carries a constraint or a lifecycle the longer one does not.
          if (a.unique || a.partialFilterExpression || a.expireAfterSeconds !== undefined) continue;
          expect([`${name}.${a.name}`, isPrefixOf(a.key, b.key)]).toEqual([`${name}.${a.name}`, false]);
        }
      }
    }
  });
});
