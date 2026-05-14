import { Schema, model, Document, Types } from 'mongoose';

export type ProbeRange = 'R1' | 'R2' | 'R3';

export interface INepSession extends Document {
  id: string; // UUID v4 from mobile app
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  deviceName: string;
  startTimestamp: number;
  endTimestamp: number | null;
  timezoneName: string;
  timezoneOffset: number;
  probeRange: ProbeRange | null;
  turbidityEnabled: boolean;
  temperatureEnabled: boolean;
  locationEnabled: boolean;
  comment: string;
  sampleCount: number;
  turbidityAvg: number | null;
  turbidityMin: number | null;
  turbidityMax: number | null;
  temperatureAvg: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  hasTempData: boolean;
  hasGpsData: boolean;
  isDemoMode: boolean;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const nepSessionSchema = new Schema<INepSession>(
  {
    id: { type: String, required: true, unique: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    deviceName: { type: String, required: true },
    startTimestamp: { type: Number, required: true },
    endTimestamp: { type: Number, default: null },
    timezoneName: { type: String, required: true },
    timezoneOffset: { type: Number, required: true },
    probeRange: { type: String, enum: ['R1', 'R2', 'R3', null], default: null },
    turbidityEnabled: { type: Boolean, default: true },
    temperatureEnabled: { type: Boolean, default: true },
    locationEnabled: { type: Boolean, default: false },
    comment: { type: String, default: '' },
    sampleCount: { type: Number, default: 0 },
    turbidityAvg: { type: Number, default: null },
    turbidityMin: { type: Number, default: null },
    turbidityMax: { type: Number, default: null },
    temperatureAvg: { type: Number, default: null },
    temperatureMin: { type: Number, default: null },
    temperatureMax: { type: Number, default: null },
    hasTempData: { type: Boolean, default: false },
    hasGpsData: { type: Boolean, default: false },
    isDemoMode: { type: Boolean, default: false },
    syncedAt: { type: Date, required: true, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

nepSessionSchema.index({ id: 1 }, { unique: true });
nepSessionSchema.index({ organizationId: 1, startTimestamp: -1 });
nepSessionSchema.index({ deviceId: 1, startTimestamp: -1 });
nepSessionSchema.index({ organizationId: 1, turbidityAvg: -1 });
nepSessionSchema.index({ organizationId: 1, isDemoMode: 1 }, { sparse: true });

export const NepSession = model<INepSession>('NepSession', nepSessionSchema);
