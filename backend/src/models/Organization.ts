import { Schema, model, Document, Types } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  contactEmail: string;
  country: string;
  timezone: string;
  /**
   * The customer's own folder under the SFTP upload root, e.g. `Acme Marine`.
   *
   * Station folders live beneath it as `<uploadFolder>/<Tower>`, which is what
   * `StationAccount.folderPath` records. Kept here so the folder is decided when
   * the customer is created rather than improvised at provisioning time — the
   * client routes data by folder, so this IS the customer's identity on disk.
   */
  uploadFolder: string;
  /**
   * What this customer's copy of the admin panel looks like.
   *
   * Kept as a subdocument rather than loose fields so the whole thing travels
   * as one object to the shell, and so "has this customer been branded?" is a
   * single check. Every field is optional — an unbranded customer falls back to
   * the platform default, never to a half-applied theme.
   */
  branding: {
    /** Shown in the app shell instead of the organisation name. */
    displayName: string;
    /** Uploaded logo. Empty means show the wordmark. */
    logoUrl: string;
    /**
     * Storage key behind `logoUrl`, kept so a replaced logo can be removed.
     * Without it every re-upload would leak the previous file forever.
     */
    logoStorageKey: string;
    /** Accent colour as `#rrggbb` (M20 W3 validates contrast). */
    accentColor: string;
    /** Who this customer's own people contact for help. */
    supportEmail: string;
    updatedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    contactEmail: { type: String, required: true },
    country: { type: String, required: true },
    timezone: { type: String, required: true, default: 'UTC' },
    uploadFolder: { type: String, default: '' },
    branding: {
      displayName: { type: String, default: '' },
      logoUrl: { type: String, default: '' },
      logoStorageKey: { type: String, default: '' },
      accentColor: { type: String, default: '' },
      supportEmail: { type: String, default: '' },
      updatedAt: { type: Date, default: null },
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Note: slug has unique:true in field definition — no separate index needed
export const Organization = model<IOrganization>('Organization', organizationSchema);
