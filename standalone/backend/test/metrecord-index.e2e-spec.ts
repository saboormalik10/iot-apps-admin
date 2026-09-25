import { MetRecord } from '../src/models/MetRecord';

/**
 * Pure unit test for the MetRecord index definitions (no DB needed).
 *
 * Regression: {organizationId, localRecordId} was unique+SPARSE. `sparse` only
 * skips documents where the field is ABSENT, and the schema declares
 * `localRecordId: { default: null }` — so every record without a device-assigned
 * id carried an explicit null and was INCLUDED in the unique index. Exactly one
 * such record could exist per organization, so the first CSV import worked and
 * every one after it died with E11000. Verified on real data: 31 records, 0 with
 * the field absent, 1 with null.
 *
 * The fix is a partial index. If anyone reverts it to `sparse`, this fails.
 */
describe('MetRecord {organizationId, localRecordId} index (unit)', () => {
  // Mongoose stores indexes as [fields, options] tuples.
  const schema = MetRecord.schema;
  const indexes = schema.indexes() as [Record<string, unknown>, Record<string, unknown>][];
  const entry = indexes.find(
    ([fields]) => 'organizationId' in fields && 'localRecordId' in fields,
  );

  it('exists', () => {
    expect(entry).toBeDefined();
  });

  it('is unique — it de-duplicates mobile records by their device-assigned id', () => {
    expect(entry?.[1]?.unique).toBe(true);
  });

  it('is PARTIAL, not sparse — sparse does not exclude the null default', () => {
    const options = entry![1];
    expect(options.sparse).toBeFalsy();
    expect(options.partialFilterExpression).toEqual({ localRecordId: { $type: 'number' } });
  });

  it('the partial filter excludes nulls, so unlimited null-id records can coexist', () => {
    const filter = entry![1].partialFilterExpression as { localRecordId: { $type: string } };
    // $type: 'number' matches neither null nor a missing field — which is the
    // whole point: imports and manual records have no localRecordId.
    expect(filter.localRecordId.$type).toBe('number');
  });

  it('localRecordId still defaults to null (the fix must not change the write path)', () => {
    expect(schema.path('localRecordId').options.default).toBeNull();
  });
});
