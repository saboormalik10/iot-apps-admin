import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType = 'alert' | 'session_complete' | 'firmware';

export interface INotification extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['alert', 'session_complete', 'firmware'], required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL: auto-purge after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const Notification = model<INotification>('Notification', notificationSchema);
