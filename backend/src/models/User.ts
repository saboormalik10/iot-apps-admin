import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'operator' | 'viewer';

export type MobileAppType = 'MET-LINK' | 'NEP-LINK';

export interface IUser extends Document {
  organizationId: Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  /**
   * Denormalised mirror of the assigned Role's `key`.
   *
   * KEPT deliberately alongside roleId: it is what the JWT carries, what
   * RolesGuard reads, what publicUser() returns, what the frontend `Role` union
   * types, and what the last-admin guard counts. Dropping it would touch all of
   * those at once; it is retired in a later pass instead.
   */
  role: UserRole;
  roleId: Types.ObjectId | null;
  /**
   * Platform-wide administrator, above every organisation.
   *
   * A FLAG rather than a role value: a role lives inside one organisation, and
   * this is precisely the identity that does not. Keeping it separate also means
   * none of the existing @Roles('admin') checks change meaning.
   */
  isSuperAdmin: boolean;
  /** Which mobile app the user signed up from (null = admin-panel user). */
  mobileAppType: MobileAppType | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  invitedAt: Date | null;
  invitedBy: Types.ObjectId | null;
  /**
   * Soft delete. Set when a user is removed from an organisation.
   *
   * Soft, because AuditLog names its actor by id — a hard delete would turn every
   * historical entry into a dangling reference. The removal also tombstones the
   * email (`deleted+<id>@…`), because `email` is uniquely indexed platform-wide and
   * the address must be re-usable if the person is ever re-added.
   */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true },
    // NOT required: every creation DTO makes it optional, and the services default
    // it to ''. Mongoose treats '' as missing under `required`, so a user created
    // without a surname failed validation with a 500 — the invite path (M15,
    // disabled) carried the same defect and simply never ran. Plenty of people
    // have one name; the API should not insist otherwise.
    lastName: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'operator', 'viewer'], default: 'viewer' },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    isSuperAdmin: { type: Boolean, default: false },
    mobileAppType: { type: String, enum: ['MET-LINK', 'NEP-LINK', null], default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Note: email has unique:true in field definition — no separate index needed
userSchema.index({ organizationId: 1 });
// Needed by the role-deletion reassignment flow (M18 W4): counting and bulk-
// updating everyone holding a role must not scan the collection.
userSchema.index({ roleId: 1 });

export const User = model<IUser>('User', userSchema);
