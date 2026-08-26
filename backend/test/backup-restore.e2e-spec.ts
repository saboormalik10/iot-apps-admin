import { EJSON, ObjectId } from 'bson';

/**
 * Backup fidelity (M23 W2).
 *
 * `backup-db.ts` serialised with `JSON.stringify`, and its documented restore
 * used `mongoimport` — a tool that is not installed, which is why the backup
 * script exists at all. So the restore path had never been executed.
 *
 * Running it revealed the real defect: a plain stringify writes every ObjectId
 * as a string and every Date as an ISO string. A restore then rebuilds documents
 * whose `_id` and foreign keys are STRINGS. Nothing errors. The data is simply
 * no longer joined to anything, and you find out much later.
 */

const doc = {
  _id: new ObjectId('6a8bfc4c6653f87fc268da84'),
  organizationId: new ObjectId('6a437ef2ee000f4be3eb5b14'),
  lastIngestAt: new Date('2026-08-25T10:00:00.000Z'),
  account: 'wxstation',
  isActive: true,
};

describe('a plain JSON dump — what we had', () => {
  const roundTrip = JSON.parse(JSON.stringify(doc));

  it('DEGRADES ObjectIds to strings', () => {
    expect(typeof roundTrip._id).toBe('string');
    expect(roundTrip._id instanceof ObjectId).toBe(false);
  });

  it('degrades Dates to strings', () => {
    expect(typeof roundTrip.lastIngestAt).toBe('string');
  });

  it('breaks the join, which is the part that has no error to show for it', () => {
    // A query for the real ObjectId finds nothing, because the restored value is
    // a string that merely LOOKS like one.
    const restoredId = roundTrip.organizationId;
    expect(new ObjectId('6a437ef2ee000f4be3eb5b14').equals(restoredId)).toBe(true);
    // ...but the stored type is wrong, so an equality match in MongoDB fails:
    expect(restoredId).not.toBeInstanceOf(ObjectId);
  });
});

describe('an EJSON dump — what we have now', () => {
  const roundTrip = EJSON.parse(EJSON.stringify(doc, { relaxed: false }), { relaxed: false }) as typeof doc;

  it('preserves ObjectIds', () => {
    expect(roundTrip._id).toBeInstanceOf(ObjectId);
    expect(roundTrip._id.equals(doc._id)).toBe(true);
  });

  it('preserves Dates', () => {
    expect(roundTrip.lastIngestAt).toBeInstanceOf(Date);
    expect(roundTrip.lastIngestAt.getTime()).toBe(doc.lastIngestAt.getTime());
  });

  it('preserves references, so the restored data still joins', () => {
    expect(roundTrip.organizationId).toBeInstanceOf(ObjectId);
    expect(roundTrip.organizationId.equals(doc.organizationId)).toBe(true);
  });

  it('preserves ordinary scalars unchanged', () => {
    expect(roundTrip.account).toBe('wxstation');
    expect(roundTrip.isActive).toBe(true);
  });

  it('writes `relaxed: false`, so a Date is not silently an ISO string', () => {
    // `relaxed: true` emits {"$date": "2026-…"} which parses back as a Date, but
    // also emits plain numbers for longs — losing precision on large integers.
    const strict = EJSON.stringify(doc, { relaxed: false });
    expect(strict).toContain('$oid');
    expect(strict).toContain('$date');
  });
});
