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
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: { type: String, enum: ['admin', 'operator', 'viewer'], default: 'viewer' },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    isSuperAdmin: { type: Boolean, default: false },
    mobileAppType: { type: String, enum: ['MET-LINK', 'NEP-LINK', null], default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// Note: email has unique:true in field definition — no separate index needed
userSchema.index({ organizationId: 1 });
// Needed by the role-deletion reassignment flow (M18 W4): counting and bulk-
// updating everyone holding a role must not scan the collection.
userSchema.index({ roleId: 1 });

export const User = model<IUser>('User', userSchema);
