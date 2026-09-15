import { Schema, model, Document, Types } from 'mongoose';

export interface IMetMeasure extends Document {
  recordId: Types.ObjectId;
  organizationId: Types.ObjectId;
  rowType: 'header' | 'data';
  dataSentence: string;
  timeStamp: string;
  timestampMs: number;
  /**
   * Resolution of this record. `'1m'` is a one-minute record — the shape
   * everything has written since Sept 2026.
   *
   * Absent on the per-reading rows written before that. They are left exactly as
   * they are and expire on the existing TTL; nothing needs to migrate, and a
   * read path that does not care sees both as ordinary rows with the same field
   * names. It exists so the uniqueness rule below can apply to new records
   * WITHOUT tripping over the historical duplicates — the sensor genuinely
   * emitted two readings in the same second, 280 times in the sampled corpus.
   */
  res?: '1m';
  // Wind
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windSpeedRelMs: number | null;
  windSpeedTrueMs: number | null;
  windDirRelDeg: number | null;
  windDirTrueDeg: number | null;
  /**
   * Per-second samples behind this minute. 60 is a full minute at 1 Hz.
   *
   * Reported rather than assumed: a minute rebuilt from 6 samples after a
   * dropout is not the same measurement as one built from 60, and it is what
   * weights this minute when it is folded into the 2- and 10-minute means.
   */
  windSampleCount?: number;
  /**
   * Mean unit-vector components of this minute's direction.
   *
   * Stored so a longer window can be recombined EXACTLY from minutes that are
   * already written: 350° and 10° average to 0°, and that is only recoverable
   * from sine and cosine. Not for display — `windDirRelDeg` is the bearing.
   */
  windDirSin?: number;
  windDirCos?: number;
  /**
   * WMO gust: the peak 3-second mean within this minute, and its direction.
   *
   * Computed at ingest because it CANNOT be recovered afterwards — a minute mean
   * has already smoothed away the peak the gust is meant to capture. This is
   * what a hardware logger reports and why every AWS sends gust beside mean.
   */
  windGustMs?: number | null;
  windGustDirDeg?: number | null;
  /** Rolling WMO means ending at this minute — 2-minute and 10-minute. */
  windSpeedMean2mMs?: number | null;
  windDir2mDeg?: number | null;
  windSpeedMean10mMs?: number | null;
  windDir10mDeg?: number | null;
  /** Minutes actually present in the 10-minute window — thin windows stay visible. */
  windMean10mMinutes?: number;
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
  /**
   * QC codes for the fields this row FAILED (WMO-No. 8 Part IV) — see ingest/qc.ts.
   *
   * Absent on a good reading, which is almost every reading, so it costs nothing
   * at the 15 MB/day this collection already writes. Present means at least one
   * field was nulled; `dataSentence` still holds the original CSV line verbatim,
   * so the rejected value is recoverable and the decision is auditable.
   *
   * Nothing needs to filter on it. The failed field was nulled, and `$avg`,
   * `$min` and `$max` skip null and missing alike — so every existing aggregate
   * already excludes bad data without a query change.
   */
  qc?: string[];
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
    // No default, for the same reason the sensor fields have none: writing an
    // empty array on every clean row would add a key to 86,400 documents a day
    // to say nothing.
    qc: { type: [String] },
    windSpeedMs: { type: Number },
    windSpeedKmh: { type: Number },
    windSpeedKnots: { type: Number },
    windSpeedRelMs: { type: Number },
    windSpeedTrueMs: { type: Number },
    windDirRelDeg: { type: Number },
    windDirTrueDeg: { type: Number },
    res: { type: String, enum: ['1m'] },
    windSampleCount: { type: Number },
    windDirSin: { type: Number },
    windDirCos: { type: Number },
    windGustMs: { type: Number },
    windGustDirDeg: { type: Number },
    windSpeedMean2mMs: { type: Number },
    windDir2mDeg: { type: Number },
    windSpeedMean10mMs: { type: Number },
    windDir10mDeg: { type: Number },
    windMean10mMinutes: { type: Number },
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

/**
 * One minute record per station, enforced.
 *
 * Wind and environmental arrive as SEPARATE files for the same minute, so the
 * minute record is upserted: whichever lands first creates it and the other
 * merges into it. Without a unique key a catch-up batch handling both at once
 * could create two half-filled records for the same instant.
 *
 * PARTIAL on `res: '1m'`, and that is what makes it buildable at all: the
 * historical per-reading rows contain genuine duplicate timestamps — the sensor
 * emits faster than 1 Hz and the timestamp is truncated to whole seconds — so a
 * blanket unique index here would fail to build and, if it somehow did, would
 * reject real data.
 */
metMeasureSchema.index(
  // `res` sits SECOND on purpose. Uniqueness is wanted on (recordId, timestampMs)
  // among minute records, but that exact key pattern is already declared above
  // for range scans — and one key pattern must have exactly one declaration, or
  // removing the visible one leaves the index quietly alive. Putting the
  // discriminator in the middle gives a genuinely distinct index that enforces
  // the same constraint, and keeps it from being a prefix of, or prefixed by,
  // the scan index.
  { recordId: 1, res: 1, timestampMs: 1 },
  { unique: true, partialFilterExpression: { res: '1m' }, name: 'minute_record_unique' },
);

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
  /**
   * 30 days — one month, restored Sept 2026 once records became per-MINUTE.
   *
   * It had been halved to 15 because per-second rows filled 512 MB in under
   * three weeks at ~19 MB/day. One record a minute instead of one a second is
   * about 61x fewer rows, measured on live data, which puts a month at roughly
   * 20 MB per station — so the window that forced the cut is no longer the
   * constraint. The daily rollups in `metdailysummaries` keep the long-term
   * history regardless and have no TTL.
   *
   * CHANGING THIS NUMBER IS NOT ENOUGH ON ITS OWN. MongoDB will not alter an
   * existing TTL from a re-declaration — `createIndex` with a different
   * `expireAfterSeconds` conflicts rather than updates. Run
   * `npm run migrate:met-ttl -- --apply`, which issues the `collMod`.
   */
  { expireAfterSeconds: 2_592_000, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
);

export const MetMeasure = model<IMetMeasure>('MetMeasure', metMeasureSchema);
