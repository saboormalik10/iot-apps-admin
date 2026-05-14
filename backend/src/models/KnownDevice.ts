import { Schema, model, Document, Types } from 'mongoose';

export interface IKnownDevice extends Document {
  organizationId: Types.ObjectId;
  bleId: string;
  name: string;
  address: string | null;
  customName: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const knownDeviceSchema = new Schema<IKnownDevice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    bleId: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String, default: null },
    customName: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

knownDeviceSchema.index({ organizationId: 1, bleId: 1 }, { unique: true });

export const KnownDevice = model<IKnownDevice>('KnownDevice', knownDeviceSchema);
