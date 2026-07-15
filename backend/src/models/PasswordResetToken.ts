import { Schema, model, Document, Types } from 'mongoose';

/**
 * Password-reset via a 6-digit OTP code (mobile-friendly — no clickable link).
 * Lifecycle of one document:
 *   1. forgot-password   → create with `codeHash` (+ 15-min `expiresAt`).
 *   2. verify-reset-code → on the correct code, `codeHash` is cleared and a
 *      single-use `resetTokenHash` is issued (+ a fresh 15-min `expiresAt`),
 *      `verifiedAt` set. Wrong codes bump `attempts`; too many invalidate it.
 *   3. reset-password    → consumes `resetTokenHash`, sets `usedAt`.
 */
export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId;
  email: string;
  /** sha256 of the 6-digit code — present until verified, then null. */
  codeHash: string | null;
  /** sha256 of the single-use reset token — issued at verify, consumed at reset. */
  resetTokenHash: string | null;
  /** Failed verify attempts; the code is invalidated past the cap. */
  attempts: number;
  verifiedAt: Date | null;
  /** Governs the CURRENT step: the code first, then (after verify) the reset token. */
  expiresAt: Date;
  usedAt: Date | null;
  ipAddress: string | null;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true },
    codeHash: { type: String, default: null },
    resetTokenHash: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL — auto-purge when expiresAt passes.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// verify looks up the active code by email; reset looks up by resetTokenHash.
passwordResetTokenSchema.index({ email: 1 });
passwordResetTokenSchema.index({ resetTokenHash: 1 }, { sparse: true });
passwordResetTokenSchema.index({ userId: 1 });

export const PasswordResetToken = model<IPasswordResetToken>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
