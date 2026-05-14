import { Schema, model, Document, Types } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  contactEmail: string;
  country: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    contactEmail: { type: String, required: true },
    country: { type: String, required: true },
    timezone: { type: String, required: true, default: 'UTC' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Note: slug has unique:true in field definition — no separate index needed
export const Organization = model<IOrganization>('Organization', organizationSchema);
