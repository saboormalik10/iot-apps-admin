import { Schema, model, Document, Types } from 'mongoose';

/**
 * Raw per-second samples, kept only for stations with `storeRawSamples` on.
 *
 * SEPARATE FROM `metmeasures` ON PURPOSE. That collection is now one record per
 * station per minute — the shape every chart, rollup and export reads, and the
 * shape the customer asked for. Mixing 1 Hz rows back into it would put two
 * different resolutions behind one query and silently change what an average
 * means depending on which station and which day it touched.
 *
 * This is a debugging and commissioning store, not a second source of truth:
 * nothing computes statistics from it. The figures come from the minute record,
 * which was derived from these samples at ingest.
 *
 * The TTL is deliberately short. The switch exists for a "special circumstance"
 * — a suspected fault, a new site being commissioned — and those end. The
 * original CSV files remain on the SFTP server permanently regardless, so this
 * expiring is never the last copy.
 */
export interface IMetRawSample extends Document {
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  /** The minute record these samples were folded into. */
  minuteMs: number;
  timestampMs: number;
  windSpeedMs: number | null;
  windDirRelDeg: number | null;
  /** QC codes this sample raised, if any. */
  qc?: string[];
  createdAt: Date;
}

const metRawSampleSchema = new Schema<IMetRawSample>(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    minuteMs: { type: Number, required: true },
    timestampMs: { type: Number, required: true },
    // No `default: null` — see the note in MetMeasure. An absent key and a null
    // read identically, and at 86,400 rows a day the difference is the bill.
    windSpeedMs: { type: Number },
    windDirRelDeg: { type: Number },
    qc: { type: [String] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metRawSampleSchema.index({ deviceId: 1, timestampMs: 1 });

/**
 * 7 days. Short by design: this is evidence for an investigation, not history.
 * Keyed on `createdAt` because a TTL needs a Date, and because a replayed
 * historical file should live 7 days from when it was replayed rather than being
 * deleted on arrival.
 */
metRawSampleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604_800, name: 'raw_ttl_createdAt' });

export const MetRawSample = model<IMetRawSample>('MetRawSample', metRawSampleSchema);
