import { Schema, model, Document, Types } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string;
  /**
   * Organisation a super admin has switched INTO, or null for their own.
   *
   * Carried on the refresh token, not just the access token: without it, the
   * 15-minute refresh would silently re-mint against the user's home org and
   * teleport them out of the customer they were looking at, mid-session.
   */
  assumedOrganizationId: Types.ObjectId | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assumedOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
