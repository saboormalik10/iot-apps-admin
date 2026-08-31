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
    /**
     * SENSOR FIELDS ARE NOT DEFAULTED TO NULL.
     *
     * `default: null` makes Mongoose write the key on every document, so a
     * wind-only station stored 24 explicit nulls per row — measured at 850 B
     * against 420 B without them, i.e. **half the collection was nulls**. At
     * 86,400 rows/day/station that was ~30 MB/day instead of ~15.
     *
     * Absent and null behave identically everywhere that reads them: Mongo's
     * `{field: null}` matches missing documents too, `$avg`/`$min`/`$max` skip
     * both, and JS `??` treats them the same. Verified before the change — no
     * read path compares with `=== null`, nothing uses `$exists`/`$type` on
     * these fields, and the CSV exports already use `?? ''`.
     *
     * `source` KEEPS its default: the 30-day TTL is a partial index filtered on
     * it, so the key has to exist or rows would never expire.
     */
    source: { type: String, enum: ['sftp', 'mobile', null], default: null },
    windSpeedMs: { type: Number },
    windSpeedKmh: { type: Number },
    windSpeedKnots: { type: Number },
    windSpeedRelMs: { type: Number },
    windSpeedTrueMs: { type: Number },
    windDirRelDeg: { type: Number },
    windDirTrueDeg: { type: Number },
    tempC: { type: Number },
    humidityPct: { type: Number },
    pressureHpa: { type: Number },
    precipMm: { type: Number },
    precipRateMmHr: { type: Number },
    solarWm2: { type: Number },
    voltageV: { type: Number },
    batteryVoltageV: { type: Number },
    currentA: { type: Number },
    dewPointC: { type: Number },
    qnhHpa: { type: Number },
    qfeHpa: { type: Number },
    gpsLat: { type: Number },
    gpsLng: { type: Number },
    gpsAltM: { type: Number },
    gpsSatellites: { type: Number },
    gpsHorDilution: { type: Number },
    gpsGeoidalSepM: { type: Number },
    gpsQuality: { type: Number },
    phoneLat: { type: Number },
    phoneLng: { type: Number },
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
