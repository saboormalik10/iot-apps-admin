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
 * — a suspected fault, a new site being commissioned — and those end. On the
 * site PC these ARE the only per-second record: the stream is not kept anywhere
 * else, so export what you need before they expire.
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
 * NO expiry — deliberately, and this is the second time it has been written down.
 *
 * The cloud copy this came from expired raw samples after 7 days, which suits a
 * hosted service paying for the storage. On the site PC the client's rule is
 * simply *"indefinitely cos this is their local pc"* (22 Sep 2026), and the site
 * guide tells the technician that nothing is ever deleted. A background job
 * quietly removing a week-old sample would make that untrue.
 *
 * Keeping them is safe because they are not written unless someone asks: the
 * station's `storeRawSamples` is off by default and is meant to be switched on
 * to commission a site or chase a fault, then switched off again. `startup`
 * syncs indexes, so the old TTL is dropped from databases that already have it.
 */

export const MetRawSample = model<IMetRawSample>('MetRawSample', metRawSampleSchema);
