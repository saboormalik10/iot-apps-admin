import { Schema, model, Document, Types } from 'mongoose';

export interface IMetPicture extends Document {
  recordId: Types.ObjectId;
  organizationId: Types.ObjectId;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  takenAt: Date | null;
  createdAt: Date;
}

const metPictureSchema = new Schema<IMetPicture>(
  {
    recordId: { type: Schema.Types.ObjectId, ref: 'MetRecord', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    storageKey: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    takenAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

metPictureSchema.index({ recordId: 1 });
metPictureSchema.index({ organizationId: 1 });

export const MetPicture = model<IMetPicture>('MetPicture', metPictureSchema);
