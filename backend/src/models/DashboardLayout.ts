import { Schema, model, Document, Types } from 'mongoose';

export interface IDashboardTile {
  index: number;
  nmea: string;
  type: string;
  unit: string;
  desc: string;
  label: string;
}

export interface IDashboardLayout extends Document {
  userId: Types.ObjectId;
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  isDefault: boolean;
  tiles: IDashboardTile[];
  createdAt: Date;
  updatedAt: Date;
}

const tileSchema = new Schema<IDashboardTile>(
  {
    index: { type: Number, required: true },
    nmea: { type: String, default: '' },
    type: { type: String, default: '' },
    unit: { type: String, default: '' },
    desc: { type: String, default: '' },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const dashboardLayoutSchema = new Schema<IDashboardLayout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, default: 'My Layout' },
    isDefault: { type: Boolean, default: false },
    tiles: { type: [tileSchema], required: true },
  },
  { timestamps: true },
);

dashboardLayoutSchema.index({ userId: 1, deviceId: 1 });
dashboardLayoutSchema.index({ organizationId: 1, deviceId: 1 });

export const DashboardLayout = model<IDashboardLayout>('DashboardLayout', dashboardLayoutSchema);
