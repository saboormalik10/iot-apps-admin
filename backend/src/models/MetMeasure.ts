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
  /** Where the row came from. Scopes the 30-day TTL to SFTP data only (M14). */
  source: 'sftp' | 'mobile' | null;
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
    source: { type: String, enum: ['sftp', 'mobile', null], default: null },
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
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metMeasureSchema.index({ recordId: 1, timestampMs: 1 });
metMeasureSchema.index({ organizationId: 1, timestampMs: -1 });
// REMOVED (M23 W1): `{recordId, rowType}` was a strict PREFIX of the compound
// index below, and neither is unique — so it could never be the better plan,
// while still costing a write on every one of 4.3M daily inserts at 50 stations.
// Dropping it from the database alone was not enough: `autoIndex` recreated it
// from this declaration on the next connect.
// Dashboard query: latest data row per record, windrose lookback
metMeasureSchema.index({ recordId: 1, rowType: 1, timestampMs: -1 });

// 30-day retention for station data, as agreed with the client.
//
// PARTIAL on `source: 'sftp'`, never blanket: a plain TTL here would also delete
// every mobile-era row. Keys on `createdAt` (ingest time) rather than
// `timestampMs`, because TTL requires a Date field and because a backfilled
// historical file should then live 30 days from ingest rather than being deleted
// the moment it lands.
//
// MetRecord carries a companion TTL at 35 days so a day-record always outlives
// the measures it counts — see models/MetRecord.ts.
metMeasureSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2_592_000, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
);

export const MetMeasure = model<IMetMeasure>('MetMeasure', metMeasureSchema);
