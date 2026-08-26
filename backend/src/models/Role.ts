import { Schema, model, Document, Types } from 'mongoose';

/**
 * A named set of permissions.
 *
 * GLOBAL vs ORG-OWNED
 * `organizationId: null` marks a SYSTEM role — the three seeded ones, visible to
 * every organisation and editable only by the super admin. A role created for one
 * customer carries their organisationId and is invisible to everyone else.
 *
 * That split is what lets "edit the Operator role" mean one thing rather than N
 * copies, while still allowing a customer-specific role later.
 *
 * SOFT DELETE
 * `deletedAt` rather than a hard delete, so an audit entry naming a deleted role
 * still reads correctly. That forces the unique index to be PARTIAL on
 * `deletedAt: null` — otherwise deleting "Site Supervisor" would permanently
 * reserve that key and it could never be re-created.
 */

export interface IRole extends Document {
  /** null = system role, shared by every organisation. */
  organizationId: Types.ObjectId | null;
  /** Stable machine key. Mirrored onto User.role for the legacy guards. */
  key: string;
  name: string;
  description: string;
  permissions: string[];
  /** Seeded roles cannot be deleted, only re-permissioned. */
  isSystem: boolean;
  /** Assigned to new users when none is chosen. */
  isDefault: boolean;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Validated against the catalogue in common/permissions.ts at write time, not
    // here: an enum in the schema would have to be edited in two places, and a
    // stored grant should survive a permission being renamed rather than blocking
    // the whole document from loading.
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/**
 * One live role per key per scope.
 *
 * PARTIAL on `deletedAt: null` so a soft-deleted role frees its key. A plain
 * unique index would make deletion permanent in effect — the same trap already
 * documented on MetRecord's localRecordId index.
 */
roleSchema.index(
  { organizationId: 1, key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
roleSchema.index({ organizationId: 1, deletedAt: 1 });

export const Role = model<IRole>('Role', roleSchema);
