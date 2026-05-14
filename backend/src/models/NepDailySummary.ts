import { Schema, model, Document, Types } from 'mongoose';

export interface INepDailySummary extends Document {
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  date: string;
  dateMs: number;
  turbidityAvg: number | null;
  turbidityMax: number | null;
  turbidityMin: number | null;
  turbidityStdDev: number | null;
  temperatureAvg: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  sessionCount: number;
  totalSamples: number;
  dominantProbeRange: string | null;
  r1SampleCount: number;
  r2SampleCount: number;
  r3SampleCount: number;
  drinkingCompliant: boolean | null;
  recreationalSafe: boolean | null;
  computedAt: Date;
}

const nepDailySummarySchema = new Schema<INepDailySummary>({
  deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  date: { type: String, required: true },
  dateMs: { type: Number, required: true },
  turbidityAvg: { type: Number, default: null },
  turbidityMax: { type: Number, default: null },
  turbidityMin: { type: Number, default: null },
  turbidityStdDev: { type: Number, default: null },
  temperatureAvg: { type: Number, default: null },
  temperatureMax: { type: Number, default: null },
  temperatureMin: { type: Number, default: null },
  sessionCount: { type: Number, default: 0 },
  totalSamples: { type: Number, default: 0 },
  dominantProbeRange: { type: String, default: null },
  r1SampleCount: { type: Number, default: 0 },
  r2SampleCount: { type: Number, default: 0 },
  r3SampleCount: { type: Number, default: 0 },
  drinkingCompliant: { type: Boolean, default: null },
  recreationalSafe: { type: Boolean, default: null },
  computedAt: { type: Date, required: true, default: Date.now },
});

nepDailySummarySchema.index({ deviceId: 1, dateMs: -1 }, { unique: true });
nepDailySummarySchema.index({ organizationId: 1, dateMs: -1 });

export const NepDailySummary = model<INepDailySummary>('NepDailySummary', nepDailySummarySchema);
