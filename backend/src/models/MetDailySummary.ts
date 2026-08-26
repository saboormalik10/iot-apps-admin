import { Schema, model, Document, Types } from 'mongoose';

export interface IMetDailySummary extends Document {
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  date: string;
  dateMs: number;
  windSpeedAvgMs: number | null;
  windSpeedMaxMs: number | null;
  windSpeedMaxAt: number | null;
  windDirPrevailing: number | null;
  windCalmPct: number | null;
  beaufortDistribution: number[];
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  tempMaxAt: number | null;
  tempMinAt: number | null;
  humidityAvgPct: number | null;
  humidityMaxPct: number | null;
  humidityMinPct: number | null;
  pressureAvgHpa: number | null;
  pressureMaxHpa: number | null;
  pressureMinHpa: number | null;
  pressureTendency: string | null;
  pressureTendencyHpaPerHr: number | null;
  precipTotalMm: number | null;
  precipRateMaxMmHr: number | null;
  precipRateAvgMmHr: number | null;
  solarMaxWm2: number | null;
  solarAvgWm2: number | null;
  solarDailyKwhM2: number | null;
  dewPointAvgC: number | null;
  dewPointSpreadAvg: number | null;
  sampleCount: number;
  expectedSamples: number;
  completenessPercent: number;
  computedAt: Date;
}

const metDailySummarySchema = new Schema<IMetDailySummary>({
  deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  date: { type: String, required: true },
  dateMs: { type: Number, required: true },
  windSpeedAvgMs: { type: Number, default: null },
  windSpeedMaxMs: { type: Number, default: null },
  windSpeedMaxAt: { type: Number, default: null },
  windDirPrevailing: { type: Number, default: null },
  windCalmPct: { type: Number, default: null },
  beaufortDistribution: { type: [Number], default: [] },
  tempAvgC: { type: Number, default: null },
  tempMaxC: { type: Number, default: null },
  tempMinC: { type: Number, default: null },
  tempMaxAt: { type: Number, default: null },
  tempMinAt: { type: Number, default: null },
  humidityAvgPct: { type: Number, default: null },
  humidityMaxPct: { type: Number, default: null },
  humidityMinPct: { type: Number, default: null },
  pressureAvgHpa: { type: Number, default: null },
  pressureMaxHpa: { type: Number, default: null },
  pressureMinHpa: { type: Number, default: null },
  pressureTendency: { type: String, default: null },
  pressureTendencyHpaPerHr: { type: Number, default: null },
  precipTotalMm: { type: Number, default: null },
  precipRateMaxMmHr: { type: Number, default: null },
  precipRateAvgMmHr: { type: Number, default: null },
  solarMaxWm2: { type: Number, default: null },
  solarAvgWm2: { type: Number, default: null },
  solarDailyKwhM2: { type: Number, default: null },
  dewPointAvgC: { type: Number, default: null },
  dewPointSpreadAvg: { type: Number, default: null },
  sampleCount: { type: Number, default: 0 },
  expectedSamples: { type: Number, default: 86400 },
  completenessPercent: { type: Number, default: 0 },
  computedAt: { type: Date, required: true, default: Date.now },
});

// Keyed on the LOCAL date string, not on `dateMs`.
//
// `dateMs` is a millisecond instant, so two callers computing the day-start even
// slightly differently — one from localDayBounds, one from a record's first
// reading — produced TWO summary rows for the same calendar day instead of
// updating one. Observed in the live database: 2026-08-21 existed twice, at
// 14:00:00 and 14:02:00.
//
// `date` is 'YYYY-MM-DD' in the organisation's timezone: stable, and it compares
// lexicographically, so range queries need no timezone arithmetic at all.
metDailySummarySchema.index({ deviceId: 1, date: 1 }, { unique: true });
metDailySummarySchema.index({ deviceId: 1, dateMs: -1 });
metDailySummarySchema.index({ organizationId: 1, dateMs: -1 });

export const MetDailySummary = model<IMetDailySummary>('MetDailySummary', metDailySummarySchema);
