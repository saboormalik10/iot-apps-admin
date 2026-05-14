import { Schema, model, Document, Types } from 'mongoose';

export interface IMetMeasureDownsampled extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  recordId: Types.ObjectId;
  bucketStart: number;
  sampleCount: number;
  windSpeedRelMsAvg: number | null;
  windSpeedRelMsMin: number | null;
  windSpeedRelMsMax: number | null;
  windDirRelDegAvg: number | null;
  windSpeedTrueMsAvg: number | null;
  windSpeedTrueMsMin: number | null;
  windSpeedTrueMsMax: number | null;
  windDirTrueDegAvg: number | null;
  tempCAvg: number | null;
  tempCMin: number | null;
  tempCMax: number | null;
  humidityPctAvg: number | null;
  pressureHpaAvg: number | null;
  dewPointCAvg: number | null;
  qfeHpaAvg: number | null;
  qnhHpaAvg: number | null;
  precipMmAvg: number | null;
  precipRateMmHrAvg: number | null;
  precipRateMmHrMax: number | null;
  solarWm2Avg: number | null;
  solarWm2Max: number | null;
  voltageVAvg: number | null;
  currentAAvg: number | null;
  gpsLatAvg: number | null;
  gpsLngAvg: number | null;
  gpsAltMAvg: number | null;
  createdAt: Date;
}

const metMeasureDownsampledSchema = new Schema<IMetMeasureDownsampled>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    recordId: { type: Schema.Types.ObjectId, ref: 'MetRecord', required: true },
    bucketStart: { type: Number, required: true },
    sampleCount: { type: Number, required: true },
    windSpeedRelMsAvg: { type: Number, default: null },
    windSpeedRelMsMin: { type: Number, default: null },
    windSpeedRelMsMax: { type: Number, default: null },
    windDirRelDegAvg: { type: Number, default: null },
    windSpeedTrueMsAvg: { type: Number, default: null },
    windSpeedTrueMsMin: { type: Number, default: null },
    windSpeedTrueMsMax: { type: Number, default: null },
    windDirTrueDegAvg: { type: Number, default: null },
    tempCAvg: { type: Number, default: null },
    tempCMin: { type: Number, default: null },
    tempCMax: { type: Number, default: null },
    humidityPctAvg: { type: Number, default: null },
    pressureHpaAvg: { type: Number, default: null },
    dewPointCAvg: { type: Number, default: null },
    qfeHpaAvg: { type: Number, default: null },
    qnhHpaAvg: { type: Number, default: null },
    precipMmAvg: { type: Number, default: null },
    precipRateMmHrAvg: { type: Number, default: null },
    precipRateMmHrMax: { type: Number, default: null },
    solarWm2Avg: { type: Number, default: null },
    solarWm2Max: { type: Number, default: null },
    voltageVAvg: { type: Number, default: null },
    currentAAvg: { type: Number, default: null },
    gpsLatAvg: { type: Number, default: null },
    gpsLngAvg: { type: Number, default: null },
    gpsAltMAvg: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metMeasureDownsampledSchema.index({ deviceId: 1, bucketStart: -1 });
metMeasureDownsampledSchema.index({ organizationId: 1, bucketStart: -1 });

export const MetMeasureDownsampled = model<IMetMeasureDownsampled>(
  'MetMeasureDownsampled',
  metMeasureDownsampledSchema,
);
