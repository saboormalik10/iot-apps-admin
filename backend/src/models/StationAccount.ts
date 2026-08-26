import { Schema, model, Document, Types } from 'mongoose';

/**
 * Maps an SFTP login to the organization and device its uploads belong to.
 *
 * This is how a file that carries no identity of its own gets routed to the right
 * customer. The station authenticates once, to sshd, with a Unix password; the
 * account name it wrote as IS its identity. Nothing inside the file is trusted
 * for routing — the filename prefix already changed once (`wind_` → `WindSonic_`)
 * inside fifteen hours.
 *
 * PRE-REGISTERED, NEVER INFERRED. An unknown account is rejected rather than
 * auto-creating a device: a typo'd or attacker-chosen account name would
 * otherwise silently mint an orphan station belonging to nobody. Provisioning
 * (M21) creates these rows explicitly.
 */

export interface IStationAccount extends Document {
  /** The Unix/SFTP username, e.g. `wxstation` or `wx-acme-01`. */
  account: string;
  /**
   * Upload folder RELATIVE to the account's root, e.g. `Observator/Demo Tower`.
   *
   * This — not the account — is what identifies a station. The client confirmed
   * (25 Aug) that their telemetry devices have no public IPs and that "data
   * routing is determined by the target data folder", so one customer account
   * serves many towers, each in its own subfolder.
   *
   * `''` is the legacy flat layout: files dropped straight into the upload root.
   */
  folderPath: string;
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  /** What the station sends. Keys the parser registry once more streams exist. */
  streamType: string;
  /** Absolute chroot-relative upload path, for the agent's benefit. */
  uploadPath: string;
  isActive: boolean;
  lastIngestAt: Date | null;
  /**
   * Disk used by this station's uploads, as last reported by the agent.
   *
   * REPORTED, NOT ENFORCED. A hard quota would eventually refuse a legitimate
   * upload, and the logger has nowhere to put a rejected file — that is data
   * loss at the source. Since the client requires uploads to be kept for good,
   * the honest control is visibility: show the growth, alarm early, and let an
   * operator move old archives to cold storage.
   */
  diskUsageBytes: number | null;
  diskUsageAt: Date | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const stationAccountSchema = new Schema<IStationAccount>(
  {
    account: { type: String, required: true, lowercase: true, trim: true },
    // NOT lowercased: `Demo Tower` is the real folder name on disk, and the
    // agent reports what it actually read.
    folderPath: { type: String, required: true, default: '', trim: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    streamType: { type: String, required: true, default: 'met-csv' },
    uploadPath: { type: String, default: '/upload' },
    isActive: { type: Boolean, default: true },
    lastIngestAt: { type: Date, default: null },
    diskUsageBytes: { type: Number, default: null },
    diskUsageAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

// (account, folderPath) maps to exactly one device — the routing must be
// unambiguous. NOT unique on `account` alone: one customer account now owns many
// tower folders, which is exactly what the flat index used to forbid.
stationAccountSchema.index({ account: 1, folderPath: 1 }, { unique: true });
stationAccountSchema.index({ organizationId: 1 });
stationAccountSchema.index({ deviceId: 1 });

export const StationAccount = model<IStationAccount>('StationAccount', stationAccountSchema);
