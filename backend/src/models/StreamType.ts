import { Schema, model, Document, Types } from 'mongoose';

/**
 * Operator-facing configuration for a stream type.
 *
 * The PARSER lives in code (the registry); this is the metadata around it —
 * whether it may be assigned, who owns it, what an operator should know. Kept
 * apart deliberately: a parser is executable behaviour that belongs under
 * review, while "is this type available to customers yet" is an operational
 * decision somebody should be able to make without a deploy.
 *
 * A row here does NOT create a parser. `parserKey` must name one that exists,
 * and a row pointing at a missing parser is reported as unavailable rather than
 * failing at ingest time.
 */
export interface IStreamType extends Document {
  /** Stable key stored on `StationAccount.streamType`. */
  key: string;
  /** Which registered parser reads this stream. Usually equal to `key`. */
  parserKey: string;
  name: string;
  description: string;
  /** Null for a built-in type available to every customer. */
  organizationId: Types.ObjectId | null;
  /** Whether it may be assigned to a station. Turning this off strands nothing. */
  isEnabled: boolean;
  /** Built-ins cannot be deleted; they are defined in code. */
  isBuiltIn: boolean;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const streamTypeSchema = new Schema<IStreamType>(
  {
    key: { type: String, required: true, lowercase: true, trim: true },
    parserKey: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    isEnabled: { type: Boolean, default: true },
    isBuiltIn: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// PARTIAL on deletedAt, matching Role: a plain unique index would make deleting
// a stream type permanently reserve its key.
streamTypeSchema.index({ organizationId: 1, key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export const StreamType = model<IStreamType>('StreamType', streamTypeSchema);
