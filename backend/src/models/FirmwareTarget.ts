import { Schema, model, Document, Types } from 'mongoose';

export type DeviceType = 'MET-LINK' | 'NEP-LINK';

export interface IFirmwareTarget extends Document {
  organizationId: Types.ObjectId;
  deviceType: DeviceType;
  version: string;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const firmwareTargetSchema = new Schema<IFirmwareTarget>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceType: { type: String, enum: ['MET-LINK', 'NEP-LINK'], required: true },
    version: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

firmwareTargetSchema.index({ organizationId: 1, deviceType: 1 }, { unique: true });

export const FirmwareTarget = model<IFirmwareTarget>('FirmwareTarget', firmwareTargetSchema);
