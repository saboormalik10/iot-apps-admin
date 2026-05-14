import { Schema, model, Document, Types } from 'mongoose';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'invite'
  | 'revoke'
  | 'export'
  | 'login'
  | 'logout';

export type AuditResourceType =
  | 'device'
  | 'user'
  | 'session'
  | 'record'
  | 'alertRule'
  | 'shareToken'
  | 'org'
  | 'settings';

export interface IAuditLog extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  userEmail: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  resourceName: string | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String, required: true },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'invite', 'revoke', 'export', 'login', 'logout'],
      required: true,
    },
    resourceType: {
      type: String,
      enum: ['device', 'user', 'session', 'record', 'alertRule', 'shareToken', 'org', 'settings'],
      required: true,
    },
    resourceId: { type: String, default: null },
    resourceName: { type: String, default: null },
    changes: { type: Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL: auto-purge after 2 years
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, resourceType: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
