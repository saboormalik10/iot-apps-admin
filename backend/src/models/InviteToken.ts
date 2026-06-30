import { Schema, model, Document, Types } from 'mongoose';
import { UserRole } from './User';

export interface IInviteToken extends Document {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  email: string;
  tokenHash: string;
  role: UserRole;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const inviteTokenSchema = new Schema<IInviteToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true },
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: ['admin', 'operator', 'viewer'], required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL — auto-purge when expiresAt passes
inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Note: tokenHash has unique:true in field definition — no separate index needed
inviteTokenSchema.index({ userId: 1 });

export const InviteToken = model<IInviteToken>('InviteToken', inviteTokenSchema);
