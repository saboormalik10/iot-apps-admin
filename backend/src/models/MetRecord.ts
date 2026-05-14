import { Schema, model, Document, Types } from 'mongoose';

export interface IMetRecord extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
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
metRecordSchema.index(
  { organizationId: 1, localRecordId: 1 },
  { unique: true, sparse: true },
);
metRecordSchema.index({ organizationId: 1, isDemoMode: 1 }, { sparse: true });

export const MetRecord = model<IMetRecord>('MetRecord', metRecordSchema);
