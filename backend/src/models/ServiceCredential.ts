import { Schema, model, Document, Types } from 'mongoose';

/**
 * A machine credential — for the ingest agent and the provisioning agent, which
 * authenticate as themselves rather than as a user.
 *
 * Shaped after ShareToken (org-scoped, revocable, optional expiry) with ONE
 * deliberate divergence: ShareToken stores its token in plaintext with a unique
 * index. That is defensible for a read-only capability URL. It is not acceptable
 * for a credential that WRITES measurement data, so this stores a SHA-256 hash
 * and compares in constant time.
 *
 * `tokenPrefix` is indexed and displayable so the guard can find the row with one
 * lookup instead of hashing every candidate, and so the UI can show which
 * credential is which without ever holding the secret.
 *
 * Wire format: `obsi_<prefix>_<secret>` (ingest) / `obsp_<prefix>_<secret>` (provision).
 */

export type ServiceCredentialKind = 'ingest' | 'provision';

export interface IServiceCredential extends Document {
  organizationId: Types.ObjectId;
  name: string;
  kind: ServiceCredentialKind;
  /** Public, indexed lookup key. Not a secret. */
  tokenPrefix: string;
  /** sha256 of the full token. The token itself is shown once, at creation. */
  tokenHash: string;
  /** Restrict to specific devices; null means the whole organization. */
  deviceScope: Types.ObjectId[] | null;
  /** CIDR allow-list. Empty means no IP restriction. */
  allowedCidrs: string[];
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const serviceCredentialSchema = new Schema<IServiceCredential>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['ingest', 'provision'], required: true },
    tokenPrefix: { type: String, required: true },
    tokenHash: { type: String, required: true },
    deviceScope: { type: [Schema.Types.ObjectId], default: null },
    allowedCidrs: { type: [String], default: [] },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// The guard's only lookup. Unique because a prefix collision would make the
// credential ambiguous, and it is generated with enough entropy to avoid one.
serviceCredentialSchema.index({ tokenPrefix: 1 }, { unique: true });
serviceCredentialSchema.index({ organizationId: 1, kind: 1 });

export const ServiceCredential = model<IServiceCredential>('ServiceCredential', serviceCredentialSchema);
