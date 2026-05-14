import { Schema, model, Document, Types } from 'mongoose';

export type NepFileType = 'map' | 'photo' | 'csv' | 'thumbnail';

export interface INepFile extends Document {
  sessionId: string; // UUID v4
  organizationId: Types.ObjectId;
  fileType: NepFileType;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: Date | null;
  createdAt: Date;
}

const nepFileSchema = new Schema<INepFile>(
  {
    sessionId: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    fileType: { type: String, enum: ['map', 'photo', 'csv', 'thumbnail'], required: true },
    storageKey: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    capturedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

nepFileSchema.index({ sessionId: 1, fileType: 1 });
nepFileSchema.index({ organizationId: 1 });

export const NepFile = model<INepFile>('NepFile', nepFileSchema);
