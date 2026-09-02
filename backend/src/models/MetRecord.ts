import { Schema, model, Document, Types } from 'mongoose';

export interface IMetRecord extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  /** Mobile user who uploaded/synced this record (null for legacy rows). */
  userId: Types.ObjectId | null;
  deviceName: string;
  urlMaps: string | null;
  dateStart: string;
  dateEnd: string | null;
  dateStartMs: number;
  dateEndMs: number | null;
  comment: string;
  measureCount: number;
  hasHeaderRow: boolean;
  syncedAt: Date;
  localRecordId: number | null;
  /** Local calendar day (YYYY-MM-DD) this record groups. SFTP ingest only. */
  dayKey: string | null;
  source: 'sftp' | 'mobile' | null;
  /**
   * The unit code the sensor actually reported for wind speed, e.g. `K` (km/h).
   *
   * The client requires the display to show "whatever data comes from the
   * sensor", so the native unit must survive ingestion. Normalised m/s stays the
   * base for alarms and aggregates — you cannot average km/h with knots — and
   * this says which unit to render.
   *
   * Stored per DAY, not per measure: it is file-level metadata, effectively
   * constant for a station, and a per-row copy would add a string to every one of
   * ~2.6M rows per station per TTL window for no extra fidelity.
   */
  speedUnitCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const metRecordSchema = new Schema<IMetRecord>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deviceName: { type: String, required: true },
    urlMaps: { type: String, default: null },
    dateStart: { type: String, required: true },
    dateEnd: { type: String, default: null },
    dateStartMs: { type: Number, required: true },
    dateEndMs: { type: Number, default: null },
    comment: { type: String, default: '' },
    measureCount: { type: Number, default: 0 },
    hasHeaderRow: { type: Boolean, default: true },
    syncedAt: { type: Date, required: true, default: Date.now },
    localRecordId: { type: Number, default: null },
    dayKey: { type: String, default: null },
    source: { type: String, enum: ['sftp', 'mobile', null], default: null },
    speedUnitCode: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

metRecordSchema.index({ organizationId: 1, dateStartMs: -1 });
metRecordSchema.index({ deviceId: 1, dateStartMs: -1 });
// De-duplicates mobile records by the id the device assigned them. It must be a
// PARTIAL index, not a sparse one: `sparse` only skips documents where the field
// is ABSENT, and `localRecordId` defaults to null, so every record without a
// device-assigned id still landed in the index — letting exactly ONE such record
// exist per organization. Every later CSV import or null-id sync then failed with
// E11000. `$type: 'number'` excludes the nulls properly, so uniqueness applies to
// real device ids only.
// Changing these options requires dropping the old index — see
// scripts/migrate-metrecord-index.ts.
metRecordSchema.index(
  { organizationId: 1, localRecordId: 1 },
  { unique: true, partialFilterExpression: { localRecordId: { $type: 'number' } } },
);
// REMOVED (M23 W1): no read path queries records by userId. The field is still
// written (mobile-era attribution), but nothing has ever looked it up.


// One MetRecord per device per LOCAL day for SFTP ingest. PARTIAL, not sparse:
// `dayKey` defaults to null on every mobile-synced record, and a sparse index only
// skips ABSENT fields — so every null would collide and exactly one such record
// could exist per device. `$type: 'string'` excludes the nulls properly. This is
// the same trap documented on the localRecordId index above.
/**
 * The ingest day lookup: `{deviceId, dayKey, deletedAt}`, once per uploaded file.
 *
 * SEPARATE from the unique index below, deliberately. That one is PARTIAL on
 * `{dayKey: {$type: 'string'}}`, and MongoDB will not use a partial index unless
 * the query provably matches its filter — an equality on a string literal does
 * not satisfy `$type`, so the planner never even considered it. Every ingested
 * file therefore fell back to `{deviceId, dateStartMs}` and scanned that
 * device's whole day history: ~365 keys after a year, 1,440 times a day per
 * station. Measured 8 keys examined → 1 with this index (M23 W1).
 *
 * The partial one stays because it is the CONSTRAINT: a plain unique index would
 * collide on the mobile-era `dayKey: null` rows, which is the trap M14 hit.
 */
metRecordSchema.index({ deviceId: 1, dayKey: 1, deletedAt: 1 });

metRecordSchema.index(
  { deviceId: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } },
);

// Companion to the MetMeasure TTL: without this, one empty day-record per station
// per day accumulates forever and `measureCount` drifts into meaning "rows ever
// ingested" rather than "rows retained".
//
// 35 days, deliberately LONGER than the 30-day measure TTL, so a record always
// outlives its own measures (the last measure of a day expires ~31 days after the
// record is created). MetDailySummary keys on deviceId, not recordId, so the
// daily aggregates survive the record's removal.
metRecordSchema.index(
  { createdAt: 1 },
  // 18 days — deliberately longer than the measures' 15, so a day's record is
  // never orphaned while its readings are still being removed.
  { expireAfterSeconds: 1_555_200, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
);

export const MetRecord = model<IMetRecord>('MetRecord', metRecordSchema);
