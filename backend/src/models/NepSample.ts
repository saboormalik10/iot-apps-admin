import { Schema, model, Document, Types } from 'mongoose';

export interface INepSample extends Document {
  sessionId: string; // UUID v4
  organizationId: Types.ObjectId;
  timestamp: number;
  turbidityValue: number | null;
  temperatureValue: number | null;
  probeRange: string | null;
  locationLat: number | null;
  locationLng: number | null;
  batteryLevel: number | null;
  batteryRawVoltage: number | null;
  batteryCharging: boolean | null;
  demoModeEnabled: boolean | null;
  createdAt: Date;
}

const nepSampleSchema = new Schema<INepSample>(
  {
    sessionId: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    timestamp: { type: Number, required: true },
    turbidityValue: { type: Number, default: null },
    temperatureValue: { type: Number, default: null },
    probeRange: { type: String, default: null },
    locationLat: { type: Number, default: null },
    locationLng: { type: Number, default: null },
    batteryLevel: { type: Number, default: null },
    batteryRawVoltage: { type: Number, default: null },
    batteryCharging: { type: Boolean, default: null },
    demoModeEnabled: { type: Boolean, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

nepSampleSchema.index({ sessionId: 1, timestamp: 1 });
nepSampleSchema.index({ organizationId: 1, timestamp: -1 });
nepSampleSchema.index({ sessionId: 1, turbidityValue: 1 });
nepSampleSchema.index({ organizationId: 1, demoModeEnabled: 1 }, { sparse: true });

export const NepSample = model<INepSample>('NepSample', nepSampleSchema);
