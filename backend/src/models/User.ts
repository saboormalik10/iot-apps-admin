import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface IUser extends Document {
  organizationId: Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
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
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// Note: email has unique:true in field definition — no separate index needed
userSchema.index({ organizationId: 1 });

export const User = model<IUser>('User', userSchema);
