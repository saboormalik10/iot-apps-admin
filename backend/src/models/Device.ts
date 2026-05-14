import { Schema, model, Document, Types } from 'mongoose';

export type DeviceType = 'MET-LINK' | 'NEP-LINK';

export interface IDevice extends Document {
  organizationId: Types.ObjectId;
  bleId: string;
  name: string;
  customName: string | null;
  type: DeviceType;
  serialNo: string | null;
  firmwareVersion: string | null;
  lastSeenAt: Date | null;
  lastBatteryPct: number | null;
  lastBatteryVoltage: number | null;
  lastBatteryCharging: boolean | null;
  isOnline: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    bleId: { type: String, required: true },
    name: { type: String, required: true },
    customName: { type: String, default: null },
    type: { type: String, enum: ['MET-LINK', 'NEP-LINK'], required: true },
    serialNo: { type: String, default: null },
    firmwareVersion: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
    lastBatteryPct: { type: Number, default: null },
    lastBatteryVoltage: { type: Number, default: null },
    lastBatteryCharging: { type: Boolean, default: null },
    isOnline: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

deviceSchema.index({ organizationId: 1, bleId: 1 }, { unique: true });
deviceSchema.index({ organizationId: 1, type: 1 });
deviceSchema.index({ lastSeenAt: -1 });

export const Device = model<IDevice>('Device', deviceSchema);
