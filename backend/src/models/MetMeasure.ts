import { Schema, model, Document, Types } from 'mongoose';

export interface IMetMeasure extends Document {
  recordId: Types.ObjectId;
  organizationId: Types.ObjectId;
  rowType: 'header' | 'data';
  dataSentence: string;
  timeStamp: string;
  timestampMs: number;
  // Wind
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windSpeedRelMs: number | null;
  windSpeedTrueMs: number | null;
  windDirRelDeg: number | null;
  windDirTrueDeg: number | null;
  // Atmosphere
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  precipMm: number | null;
  precipRateMmHr: number | null;
  solarWm2: number | null;
  voltageV: number | null;
  batteryVoltageV: number | null;
  currentA: number | null;
  dewPointC: number | null;
  qnhHpa: number | null;
  qfeHpa: number | null;
  // Hardware GPS
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAltM: number | null;
  gpsSatellites: number | null;
  gpsHorDilution: number | null;
  gpsGeoidalSepM: number | null;
  gpsQuality: number | null;
  // Phone GPS
  phoneLat: number | null;
  phoneLng: number | null;
  isDemoMode: boolean;
  createdAt: Date;
}

const metMeasureSchema = new Schema<IMetMeasure>(
  {
    recordId: { type: Schema.Types.ObjectId, ref: 'MetRecord', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    rowType: { type: String, enum: ['header', 'data'], required: true },
    dataSentence: { type: String, required: true },
    timeStamp: { type: String, required: true },
    timestampMs: { type: Number, required: true },
    windSpeedMs: { type: Number, default: null },
    windSpeedKmh: { type: Number, default: null },
    windSpeedKnots: { type: Number, default: null },
    windSpeedRelMs: { type: Number, default: null },
    windSpeedTrueMs: { type: Number, default: null },
    windDirRelDeg: { type: Number, default: null },
    windDirTrueDeg: { type: Number, default: null },
    tempC: { type: Number, default: null },
    humidityPct: { type: Number, default: null },
    pressureHpa: { type: Number, default: null },
    precipMm: { type: Number, default: null },
    precipRateMmHr: { type: Number, default: null },
    solarWm2: { type: Number, default: null },
    voltageV: { type: Number, default: null },
    batteryVoltageV: { type: Number, default: null },
    currentA: { type: Number, default: null },
    dewPointC: { type: Number, default: null },
    qnhHpa: { type: Number, default: null },
    qfeHpa: { type: Number, default: null },
    gpsLat: { type: Number, default: null },
    gpsLng: { type: Number, default: null },
    gpsAltM: { type: Number, default: null },
    gpsSatellites: { type: Number, default: null },
    gpsHorDilution: { type: Number, default: null },
    gpsGeoidalSepM: { type: Number, default: null },
    gpsQuality: { type: Number, default: null },
    phoneLat: { type: Number, default: null },
    phoneLng: { type: Number, default: null },
    isDemoMode: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metMeasureSchema.index({ recordId: 1, timestampMs: 1 });
metMeasureSchema.index({ organizationId: 1, timestampMs: -1 });
metMeasureSchema.index({ organizationId: 1, tempC: 1 });
metMeasureSchema.index({ recordId: 1, rowType: 1 });

export const MetMeasure = model<IMetMeasure>('MetMeasure', metMeasureSchema);
