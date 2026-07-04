import { Schema, model, Document, Types } from 'mongoose';

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
    // Optional: mobile clients authenticate with the shared API key and have no
    // per-user identity, so device push tokens are org/device-scoped (userId null).
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

notificationTokenSchema.index({ userId: 1, platform: 1 });
notificationTokenSchema.index({ token: 1 }, { unique: true });
notificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationToken = model<INotificationToken>(
  'NotificationToken',
  notificationTokenSchema,
);
