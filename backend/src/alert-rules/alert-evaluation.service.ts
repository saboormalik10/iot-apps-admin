import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { AlertRule } from '../models/AlertRule';
import {
  DomainEvent,
  NepSampleEvent,
  MetMeasuresEvent,
} from '../realtime/realtime.events';
import { NotificationsService } from '../notifications/notifications.service';
import { evaluate, NEP_SENSOR_MAP, MET_SENSOR_MAP } from './evaluate';

const MAX_TRIGGER_HISTORY = 50;

/**
 * Auto-evaluates active alert rules against ingested sensor data. The sync/
 * sessions/records services already emit these events for the *last* sample per
 * upload batch, so evaluation runs once per upload — not per reading.
 */
@Injectable()
export class AlertEvaluationService {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEvent.NEP_SAMPLE)
  async onNepSample(e: NepSampleEvent): Promise<void> {
    await this.evaluateDevice(e.organizationId, e.deviceId, 'NEP', e.sample, NEP_SENSOR_MAP, { sessionId: e.sessionId });
  }

  @OnEvent(DomainEvent.MET_MEASURES)
  async onMetMeasures(e: MetMeasuresEvent): Promise<void> {
    await this.evaluateDevice(e.organizationId, e.deviceId, 'MET', e.latest, MET_SENSOR_MAP, { recordId: e.recordId });
  }

  private async evaluateDevice(
    organizationId: string,
    deviceId: string,
    appType: 'NEP' | 'MET',
    payload: Record<string, unknown>,
    sensorMap: Record<string, string>,
    extra: Record<string, unknown>,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(deviceId)) return;

    const rules = await AlertRule.find({
      organizationId: new Types.ObjectId(organizationId),
      deviceId: new Types.ObjectId(deviceId),
      appType,
      isActive: true,
    });
    if (rules.length === 0) return;

    const now = Date.now();
    for (const rule of rules) {
      const field = sensorMap[rule.sensor] ?? rule.sensor;
      const raw = payload[field];
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      if (!evaluate(rule.condition, value, rule.threshold)) continue;

      // Cooldown: skip if triggered within cooldownMinutes.
      if (rule.lastTriggeredAt && now - new Date(rule.lastTriggeredAt).getTime() < rule.cooldownMinutes * 60_000) {
        continue;
      }

      rule.lastTriggeredAt = new Date();
      rule.triggerHistory.push({ triggeredAt: new Date(), sensorValue: value, notifiedCount: rule.notifyUserIds.length });
      if (rule.triggerHistory.length > MAX_TRIGGER_HISTORY) {
        rule.triggerHistory = rule.triggerHistory.slice(-MAX_TRIGGER_HISTORY);
      }
      await rule.save();

      await this.notifications.notify(
        organizationId,
        rule.notifyUserIds.map((id) => id.toString()),
        {
          type: 'alert',
          title: rule.name,
          body: `${rule.sensor} ${rule.condition} ${rule.threshold}${rule.unit} — read ${value}${rule.unit}`,
          data: {
            ruleId: (rule._id as Types.ObjectId).toString(),
            deviceId,
            sensor: rule.sensor,
            sensorValue: value,
            threshold: rule.threshold,
            condition: rule.condition,
            unit: rule.unit,
            ...extra,
          },
        },
      );
    }
  }
}
