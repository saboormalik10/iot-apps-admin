import { Schema, model, Document, Types } from 'mongoose';

export interface ITriggerHistoryEntry {
  triggeredAt: Date;
  sensorValue: number;
  notifiedCount: number;
}

export interface IAlertRule extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  createdBy: Types.ObjectId;
  name: string;
  appType: 'MET' | 'NEP';
  sensor: string;
  condition: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  unit: string;
  isActive: boolean;
  notifyUserIds: Types.ObjectId[];
  cooldownMinutes: number;
  lastTriggeredAt: Date | null;
  triggerHistory: ITriggerHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const alertRuleSchema = new Schema<IAlertRule>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    appType: { type: String, enum: ['MET', 'NEP'], required: true },
    sensor: { type: String, required: true },
    condition: { type: String, enum: ['gt', 'lt', 'gte', 'lte'], required: true },
    threshold: { type: Number, required: true },
    unit: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    notifyUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    cooldownMinutes: { type: Number, default: 60 },
    lastTriggeredAt: { type: Date, default: null },
    triggerHistory: [
      {
        triggeredAt: { type: Date, required: true },
        sensorValue: { type: Number, required: true },
        notifiedCount: { type: Number, required: true },
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

alertRuleSchema.index({ organizationId: 1, isActive: 1 });
alertRuleSchema.index({ deviceId: 1, isActive: 1 });

export const AlertRule = model<IAlertRule>('AlertRule', alertRuleSchema);
