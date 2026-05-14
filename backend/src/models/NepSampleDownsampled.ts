import { Schema, model, Document, Types } from 'mongoose';

export interface INepSampleDownsampled extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  sessionId: string;
  bucketStart: number;
  sampleCount: number;
  turbidityAvg: number | null;
  turbidityMin: number | null;
  turbidityMax: number | null;
  temperatureAvg: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  gpsLatAvg: number | null;
  gpsLngAvg: number | null;
  batteryLevelAvg: number | null;
  createdAt: Date;
}

const nepSampleDownsampledSchema = new Schema<INepSampleDownsampled>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    sessionId: { type: String, required: true },
    bucketStart: { type: Number, required: true },
    sampleCount: { type: Number, required: true },
    turbidityAvg: { type: Number, default: null },
    turbidityMin: { type: Number, default: null },
    turbidityMax: { type: Number, default: null },
    temperatureAvg: { type: Number, default: null },
    temperatureMin: { type: Number, default: null },
    temperatureMax: { type: Number, default: null },
    gpsLatAvg: { type: Number, default: null },
    gpsLngAvg: { type: Number, default: null },
    batteryLevelAvg: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

nepSampleDownsampledSchema.index({ deviceId: 1, bucketStart: -1 });
nepSampleDownsampledSchema.index({ organizationId: 1, bucketStart: -1 });
nepSampleDownsampledSchema.index({ sessionId: 1, bucketStart: -1 });

export const NepSampleDownsampled = model<INepSampleDownsampled>(
  'NepSampleDownsampled',
  nepSampleDownsampledSchema,
);
