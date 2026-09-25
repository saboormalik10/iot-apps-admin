import { Schema, model, Document, Types } from 'mongoose';

export type DeviceType = 'MET-LINK' | 'NEP-LINK';

export interface IDevice extends Document {
  organizationId: Types.ObjectId;
  bleId: string;
  name: string;
  customName: string | null;
  type: DeviceType;
  serialNo: string | null;
  firmwareVersion: string | null;
  lastSeenAt: Date | null;
  lastBatteryPct: number | null;
  lastBatteryVoltage: number | null;
  lastBatteryCharging: boolean | null;
  isOnline: boolean;
  /** Mobile user who first registered this device (null for legacy rows). */
  registeredByUserId: Types.ObjectId | null;
  /** Mobile user whose app sent the most recent heartbeat. */
  lastSeenByUserId: Types.ObjectId | null;
  /**
   * Degrees to add to a RELATIVE wind bearing to get TRUE north.
   *
   * The station reports direction relative to its own mast (`R` in the source
   * $IIMWV sentence). Almost everything downstream reads `windDirTrueDeg` —
   * the alert sensor map, the gust chart, the CSV export and the compass tile —
   * and only the wind rose falls back to the relative field. So both are stored,
   * with true derived through this offset.
   *
   * 0 means "not yet surveyed": the true value equals the relative one and the
   * UI shows it as uncalibrated. Set it once the mast's alignment is known.
   */
  headingOffsetDeg: number;
  /**
   * What the stream's direction is measured from: `magnetic` (the GMX551's
   * compass-corrected bearing) or `mast` (its own north marker). Written by the
   * stream; the dashboard names it while no heading offset is set.
   */
  windDirReference: 'magnetic' | 'mast' | null;
  /** Sensor keys this device has actually reported, maintained by ingest. */
  availableSensors: string[];
  sensorsUpdatedAt: Date | null;
  /** Most recent wind-speed unit code the station reported, e.g. `K`. */
  reportedSpeedUnit: string | null;
  /**
   * Keep the raw per-second samples as well as the minute record.
   *
   * Off by default, and that default is the whole point: the station logs wind
   * at 1 Hz, which is 86,400 rows a day that almost nothing reads a single one
   * of. Ingest computes the minute mean, the WMO gust and the rolling means from
   * those samples and then discards them.
   *
   * Turn it on per station for the "special circumstance" — commissioning a new
   * site, chasing a suspected sensor fault, or a study that genuinely needs
   * per-second detail. Raw samples land in `metrawsamples` with a short TTL of
   * their own, so switching it on cannot quietly fill the database for good.
   *
   * Without it the per-second readings are gone once their minute is written —
   * the stream is not kept anywhere else. The minute record keeps the mean, the
   * WMO gust and the sample count.
   */
  storeRawSamples: boolean;
  /**
   * The sensor stream's rain state, saved each minute so it survives a restart:
   * the site's running total, and the gauge's last raw reading. See
   * stream/rain.ts. Null until the stream has seen rain data.
   */
  rainState: { totalMm: number; lastRawMm: number | null; lastAtMs?: number | null } | null;
  /**
   * Local hour the rain day starts, 0–23. Midnight by default; 9 is the Bureau of
   * Meteorology's 9am-to-9am rain day. The client asked for it per station (15 Sep
   * 2026). Decides "rain today" on the dashboard and the daily rows of the query.
   */
  rainDayStartHour: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    bleId: { type: String, required: true },
    name: { type: String, required: true },
    customName: { type: String, default: null },
    type: { type: String, enum: ['MET-LINK', 'NEP-LINK'], required: true },
    serialNo: { type: String, default: null },
    firmwareVersion: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
    lastBatteryPct: { type: Number, default: null },
    lastBatteryVoltage: { type: Number, default: null },
    lastBatteryCharging: { type: Boolean, default: null },
    isOnline: { type: Boolean, default: false },
    registeredByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastSeenByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    headingOffsetDeg: { type: Number, default: 0 },
    windDirReference: { type: String, enum: ['magnetic', 'mast', null], default: null },
    availableSensors: { type: [String], default: [] },
    sensorsUpdatedAt: { type: Date, default: null },
    reportedSpeedUnit: { type: String, default: null },
    storeRawSamples: { type: Boolean, default: false },
    rainState: {
      type: new Schema(
        { totalMm: { type: Number, required: true }, lastRawMm: { type: Number, default: null }, lastAtMs: { type: Number, default: null } },
        { _id: false },
      ),
      default: null,
    },
    rainDayStartHour: { type: Number, default: 0, min: 0, max: 23 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// `type` is part of the uniqueness key so one bleId can exist once per device
// family. That is what lets BOTH apps register the shared demo device as plain
// `bleId: 'demo'` — MET-LINK and NEP-LINK each get their own row, separated by
// type, instead of the second app silently receiving the first app's device.
// Real hardware keeps a globally distinct bleId, so nothing else is affected.
//
// NOTE: Mongoose creates indexes but never drops them. The old
// `organizationId_1_bleId_1` unique index must be dropped on any existing
// database or it still blocks the second demo device — see
// scripts/migrate-device-bleid-index.ts.
// REMOVED (M23 W1): implied by the stronger unique `{organizationId, bleId}`.
// If (org, bleId) is unique then (org, bleId, type) is unique automatically, so
// this added a write and misled — it suggested one bleId could exist twice with
// different types, which the narrower index already forbids.
deviceSchema.index({ organizationId: 1, type: 1 });
deviceSchema.index({ lastSeenAt: -1 });

export const Device = model<IDevice>('Device', deviceSchema);
