import { Schema, model, Document, Types } from 'mongoose';

/**
 * How long a registered device token survives without being seen again. The
 * `expiresAt` TTL index reaps anything staler, so the apps must re-register on
 * every launch (and on FCM token rotation) or the phone silently goes dark.
 * Successful deliveries slide the window forward — see PushService.
 */
export const TOKEN_TTL_DAYS = 60;

export interface INotificationToken extends Document {
  userId: Types.ObjectId | null;
  organizationId: Types.ObjectId;
  platform: 'ios' | 'android';
  token: string;
  appId: string;
  deviceModel: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const notificationTokenSchema = new Schema<INotificationToken>(
  {
    // Every client (admin + both mobile apps) now authenticates with a per-user
    // JWT, so this is always populated on registration — push targeting resolves
    // tokens by userId. Kept nullable only so pre-existing rows written under the
    // removed shared-API-key path still load; those are undeliverable and age out
    // via the TTL index below.
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    token: { type: String, required: true, unique: true },
    appId: { type: String, required: true },
    deviceModel: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// `token` already declares `unique: true` above, which builds the index — repeating
// it here only produced a "Duplicate schema index" warning on every boot.
notificationTokenSchema.index({ organizationId: 1, userId: 1 });
notificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationToken = model<INotificationToken>(
  'NotificationToken',
  notificationTokenSchema,
);
