import { Schema, model, Document, Types } from 'mongoose';

export interface IShareToken extends Document {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  resourceType: 'nepSession' | 'metRecord';
  resourceId: string;
  token: string;
  expiresAt: Date | null;
  viewCount: number;
  revokedAt: Date | null;
  createdAt: Date;
}

const shareTokenSchema = new Schema<IShareToken>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resourceType: { type: String, enum: ['nepSession', 'metRecord'], required: true },
    resourceId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

shareTokenSchema.index({ token: 1 }, { unique: true });
shareTokenSchema.index({ organizationId: 1, createdBy: 1 });
shareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export const ShareToken = model<IShareToken>('ShareToken', shareTokenSchema);
