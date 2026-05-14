import { Schema, model, Document, Types } from 'mongoose';

export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  ipAddress: string | null;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL — auto-purge when expiresAt passes
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Note: tokenHash has unique:true in field definition — no separate index needed
passwordResetTokenSchema.index({ userId: 1 });

export const PasswordResetToken = model<IPasswordResetToken>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
