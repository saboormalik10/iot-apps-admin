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
  isDemoMode: boolean;
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
    isDemoMode: { type: Boolean, default: false },
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
metRecordSchema.index({ organizationId: 1, isDemoMode: 1 }, { sparse: true });
metRecordSchema.index({ organizationId: 1, userId: 1 }, { sparse: true });

export const MetRecord = model<IMetRecord>('MetRecord', metRecordSchema);
