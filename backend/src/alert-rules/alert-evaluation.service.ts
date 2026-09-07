import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { sendAlertEmail } from '../utils/mailer';
import { AlertRule } from '../models/AlertRule';
import {
  DomainEvent,
  NepSampleEvent,
  MetMeasuresEvent,
} from '../realtime/realtime.events';
import { NotificationsService } from '../notifications/notifications.service';
import {
  evaluate,
  NEP_SENSOR_MAP,
  MET_SENSOR_MAP,
  thresholdInStoredUnit,
  valueInRuleUnit,
  SENSOR_STORED_UNIT,
} from './evaluate';
import { convertUnit } from '../analytics/analytics.util';

const MAX_TRIGGER_HISTORY = 50;

/**
 * Auto-evaluates active alert rules against ingested sensor data. The sync/
 * sessions/records services already emit these events for the *last* sample per
 * upload batch, so evaluation runs once per upload — not per reading.
 */
@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEvent.NEP_SAMPLE)
  async onNepSample(e: NepSampleEvent): Promise<void> {
    await this.evaluateDevice(e.organizationId, e.deviceId, 'NEP', e.sample, NEP_SENSOR_MAP, { sessionId: e.sessionId });
  }

  @OnEvent(DomainEvent.MET_MEASURES)
  async onMetMeasures(e: MetMeasuresEvent): Promise<void> {
    await this.evaluateDevice(e.organizationId, e.deviceId, 'MET', e.latest, MET_SENSOR_MAP, { recordId: e.recordId }, e.extremes);
  }

  private async evaluateDevice(
    organizationId: string,
    deviceId: string,
    appType: 'NEP' | 'MET',
    payload: Record<string, unknown>,
    sensorMap: Record<string, string>,
    extra: Record<string, unknown>,
    /**
     * Per-field min/max across the whole ingested batch.
     *
     * A threshold alarm asks whether the threshold was crossed AT ANY POINT, and
     * an SFTP file carries ~52 readings at 1 Hz. Measured on 399 real files, the
     * peak exceeds the last reading in 86.7% of them — so evaluating the newest
     * row alone missed most gusts, which is exactly what a wind alarm is for.
     *
     * Absent for emitters with no batch; the newest row is then used as before.
     */
    extremes?: Record<string, { min: number; max: number }>,
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

      // Pick the extreme that can actually cross this rule's threshold: the peak
      // for "above" rules, the trough for "below" ones. Falls back to the newest
      // reading when the emitter supplied no batch extremes.
      const span = extremes?.[field];
      const raw =
        span !== undefined
          ? rule.condition === 'gt' || rule.condition === 'gte'
            ? span.max
            : span.min
          : payload[field];

      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;

      // Compare like with like. `value` comes out of the database in the sensor's
      // STORED unit (wind is m/s); `rule.threshold` is in whatever unit the
      // operator picked. Converting the threshold — rather than the reading —
      // keeps the stored value untouched for the history entry below.
      const threshold = thresholdInStoredUnit(rule.sensor, rule.threshold, rule.unit, convertUnit);
      if (!evaluate(rule.condition, value, threshold)) continue;

      // Cooldown: skip if triggered within cooldownMinutes.
      if (rule.lastTriggeredAt && now - new Date(rule.lastTriggeredAt).getTime() < rule.cooldownMinutes * 60_000) {
        continue;
      }

      rule.lastTriggeredAt = new Date();
      // When the reading was TAKEN, as opposed to when we processed it. During a
      // backlog drain these are hours apart, and only this one can be plotted
      // against the measurements.
      const rawMeasuredAt = payload['measuredAtMs'];
      const measuredAtMs = typeof rawMeasuredAt === 'number' && Number.isFinite(rawMeasuredAt) ? rawMeasuredAt : undefined;
      // History keeps the STORED value — it is the raw measurement, and the unit
      // it is in is a property of the sensor, not of whatever rule observed it.
      rule.triggerHistory.push({
        triggeredAt: new Date(),
        sensorValue: value,
        notifiedCount: rule.notifyUserIds.length,
        measuredAtMs,
      });
      if (rule.triggerHistory.length > MAX_TRIGGER_HISTORY) {
        rule.triggerHistory = rule.triggerHistory.slice(-MAX_TRIGGER_HISTORY);
      }
      await rule.save();

      const displayValue = valueInRuleUnit(rule.sensor, value, rule.unit, convertUnit);

      await this.notifications.notify(
        organizationId,
        rule.notifyUserIds.map((id) => id.toString()),
        {
          type: 'alert',
          title: rule.name,
          // Reported in the RULE's unit. Printing the stored value with the
          // rule's unit label said "read 9.97km/h" for a 9.97 m/s reading —
          // the number and the unit came from different systems.
          body: `${rule.sensor} ${rule.condition} ${rule.threshold}${rule.unit} — read ${displayValue}${rule.unit}`,
          data: {
            ruleId: (rule._id as Types.ObjectId).toString(),
            deviceId,
            sensor: rule.sensor,
            // `sensorValue` is the STORED reading (wind is m/s) and stays that
            // way — it is the raw measurement. `displayValue` is the same
            // reading in the rule's unit, so a reader never has to pair
            // `sensorValue` with `unit` and get "1.67 > 3" for a breach.
            sensorValue: value,
            displayValue,
            storedUnit: SENSOR_STORED_UNIT[rule.sensor] ?? null,
            threshold: rule.threshold,
            thresholdStored: threshold,
            condition: rule.condition,
            unit: rule.unit,
            triggeredAt: rule.lastTriggeredAt.toISOString(),
            measuredAtMs: measuredAtMs ?? null,
            ...extra,
          },
        },
      );

      // Email is a SEPARATE channel, dispatched after the feed/push path and
      // never awaited into it. A wind alarm has to reach someone who is not
      // looking at a screen — but an SMTP outage must not stop the alert being
      // recorded, pushed, or shown in the feed.
      // `displayValue`, not `value` — the email prints the reading beside the
      // rule's unit, so it has to be in that unit for the two to agree.
      void this.emailRecipients(organizationId, deviceId, rule, displayValue).catch((err: Error) =>
        this.logger.warn(`alert email dispatch failed: ${err.message}`),
      );
    }
  }

  /**
   * Send the alert to each recipient's email address.
   *
   * Per-recipient rather than one BCC'd message: an alarm list is small, and a
   * single bad address must not suppress everyone else's alert.
   */
  private async emailRecipients(
    organizationId: string,
    deviceId: string,
    rule: { _id: unknown; name: string; sensor: string; condition: string; threshold: number; unit: string; notifyUserIds: unknown[] },
    value: number,
  ): Promise<void> {
    const ids = rule.notifyUserIds.map(String).filter((id) => Types.ObjectId.isValid(id));
    const filter = ids.length
      ? { _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, isActive: { $ne: false } }
      : { organizationId: new Types.ObjectId(organizationId), isActive: { $ne: false } };

    const [recipients, device] = await Promise.all([
      User.find(filter).select('email').lean(),
      Device.findById(deviceId).select('name customName').lean(),
    ]);
    if (recipients.length === 0) return;

    const deviceName = device?.customName ?? device?.name ?? 'Station';
    const base = process.env.FRONTEND_URL?.replace(/\/+$/, '') ?? '';
    const fields = {
      ruleName: rule.name,
      deviceName,
      summary: `${rule.sensor} ${rule.condition} ${rule.threshold}${rule.unit}`,
      reading: `${value}${rule.unit}`,
      triggeredAt: new Date(),
      dashboardUrl: base ? `${base}/?device=${deviceId}` : 'the Observator dashboard',
    };

    // Settled, not all: one failing address still lets the rest go out.
    const results = await Promise.allSettled(recipients.map((u) => sendAlertEmail(u.email, fields)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) this.logger.warn(`alert email: ${failed}/${recipients.length} recipient(s) failed`);
  }
}
