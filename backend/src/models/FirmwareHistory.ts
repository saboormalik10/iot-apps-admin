import { Schema, model, Document, Types } from 'mongoose';

export interface IFirmwareHistory extends Document {
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  appType: 'MET-LINK' | 'NEP-LINK';
  previousVersion: string | null;
  newVersion: string;
  detectedAt: Date;
  detectedByAppType: string;
  createdAt: Date;
}

const firmwareHistorySchema = new Schema<IFirmwareHistory>(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    appType: { type: String, enum: ['MET-LINK', 'NEP-LINK'], required: true },
    previousVersion: { type: String, default: null },
    newVersion: { type: String, required: true },
    detectedAt: { type: Date, required: true, default: Date.now },
    detectedByAppType: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

firmwareHistorySchema.index({ deviceId: 1, detectedAt: -1 });
firmwareHistorySchema.index({ organizationId: 1, detectedAt: -1 });
firmwareHistorySchema.index({ organizationId: 1, appType: 1, newVersion: 1 });

export const FirmwareHistory = model<IFirmwareHistory>('FirmwareHistory', firmwareHistorySchema);
