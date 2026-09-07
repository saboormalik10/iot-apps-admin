import { Injectable } from '@nestjs/common';
import { PipelineStage, Types } from 'mongoose';
import { AlertRule } from '../models/AlertRule';
import { Device } from '../models/Device';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { convertUnit } from '../analytics/analytics.util';
import {
  AlertCondition,
  MET_SENSOR_MAP,
  NEP_SENSOR_MAP,
  SENSOR_STORED_UNIT,
  thresholdInStoredUnit,
  valueInRuleUnit,
} from './evaluate';
import { BucketInput, buildTimeline } from './timeline';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto';

type Actor = { userId: string; email: string };

const notFound = () => Object.assign(new Error('Alert rule not found'), { statusCode: 404, code: 'NOT_FOUND' });

@Injectable()
export class AlertRulesService {
  async create(organizationId: string, body: CreateAlertRuleDto, actor: Actor) {
    await this.assertDevice(organizationId, body.deviceId);
    const notifyUserIds = await this.resolveNotifyUsers(organizationId, body.notifyUserIds);

    const rule = await AlertRule.create({
      organizationId: new Types.ObjectId(organizationId),
      deviceId: new Types.ObjectId(body.deviceId),
      createdBy: new Types.ObjectId(actor.userId),
      name: body.name,
      appType: body.appType,
      sensor: body.sensor,
      condition: body.condition,
      threshold: body.threshold,
      unit: body.unit,
      isActive: body.isActive ?? true,
      notifyUserIds,
      cooldownMinutes: body.cooldownMinutes ?? 60,
    });

    this.audit(organizationId, actor, 'create', rule._id, rule.name, null);
    return rule;
  }

  async list(organizationId: string, opts: { deviceId?: string; isActive?: boolean; page?: number; limit?: number }) {
    const page = Math.max(opts.page ?? 1, 1);
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (opts.deviceId && Types.ObjectId.isValid(opts.deviceId)) filter.deviceId = new Types.ObjectId(opts.deviceId);
    if (opts.isActive !== undefined) filter.isActive = opts.isActive;

    const [items, total] = await Promise.all([
      AlertRule.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AlertRule.countDocuments(filter),
    ]);
    return {
      data: items.map((r) => this.withDisplayValues(r)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(organizationId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const rule = await AlertRule.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!rule) throw notFound();
    return this.withDisplayValues(rule);
  }

  async update(organizationId: string, id: string, body: UpdateAlertRuleDto, actor: Actor) {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const rule = await AlertRule.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!rule) throw notFound();

    if (body.name !== undefined) rule.name = body.name;
    if (body.sensor !== undefined) rule.sensor = body.sensor;
    if (body.condition !== undefined) rule.condition = body.condition;
    if (body.threshold !== undefined) rule.threshold = body.threshold;
    if (body.unit !== undefined) rule.unit = body.unit;
    if (body.cooldownMinutes !== undefined) rule.cooldownMinutes = body.cooldownMinutes;
    if (body.isActive !== undefined) rule.isActive = body.isActive;
    if (body.notifyUserIds !== undefined) {
      rule.notifyUserIds = await this.resolveNotifyUsers(organizationId, body.notifyUserIds);
    }

    await rule.save();
    this.audit(organizationId, actor, 'update', rule._id, rule.name, { after: body });
    return rule;
  }

  async remove(organizationId: string, id: string, actor: Actor): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const rule = await AlertRule.findOneAndDelete({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!rule) throw notFound();
    this.audit(organizationId, actor, 'delete', rule._id, rule.name, null);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async assertDevice(organizationId: string, deviceId: string): Promise<void> {
    const exists = await Device.exists({
      _id: new Types.ObjectId(deviceId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    });
    if (!exists) throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  /** Keep only ids that are real, active users in this org. */
  /**
   * Minute-by-minute account of a window: what the sensor read, whether it
   * crossed the threshold, and if it crossed without alerting — why not.
   *
   * This answers the question the rules table cannot: "it says armed, so why is
   * my feed empty?" The two live answers are the threshold never being crossed
   * and the cooldown swallowing a repeat, and they look identical from outside.
   *
   * `minutes` is capped at 60. The window ends now unless `at` is given, in
   * which case it is CENTRED on that instant — a notification wants to show
   * what led up to the alert and what followed it, not just the run-up.
   */
  async timeline(
    organizationId: string,
    id: string,
    opts: { minutes?: number; at?: number } = {},
  ) {
    const rule = await this.get(organizationId, id);

    const minutes = Math.min(Math.max(Math.floor(opts.minutes ?? 60), 1), 60);
    const spanMs = minutes * 60_000;
    const at = Number.isFinite(opts.at) ? (opts.at as number) : null;
    // Align to minute boundaries so a bucket is a wall-clock minute.
    const floorMin = (ms: number) => Math.floor(ms / 60_000) * 60_000;
    const toMs = at != null ? floorMin(at + spanMs / 2) : floorMin(Date.now()) + 60_000;
    const fromMs = toMs - spanMs;

    const field = rule.appType === 'MET' ? MET_SENSOR_MAP[rule.sensor] : NEP_SENSOR_MAP[rule.sensor];
    const storedUnit = SENSOR_STORED_UNIT[rule.sensor] ?? null;
    const thresholdStored = thresholdInStoredUnit(rule.sensor, rule.threshold, rule.unit, convertUnit);
    const toDisplay = (v: number) => valueInRuleUnit(rule.sensor, v, rule.unit, convertUnit);

    const head = {
      ruleId: String(rule._id),
      deviceId: String(rule.deviceId),
      name: rule.name,
      sensor: rule.sensor,
      condition: rule.condition as AlertCondition,
      threshold: rule.threshold,
      unit: rule.unit ?? '',
      storedUnit,
      thresholdStored,
      cooldownMinutes: rule.cooldownMinutes,
      isActive: rule.isActive,
      from: fromMs,
      to: toMs,
      minutes,
    };

    // NEP has been switched off since M15 W4, so it has no measure stream to
    // reconstruct from. Say so rather than returning an empty chart that reads
    // as "the station was silent".
    if (rule.appType !== 'MET' || !field) {
      return { data: { ...head, supported: false, historyComplete: true, buckets: [] } };
    }

    const records = await MetRecord.find({
      organizationId: new Types.ObjectId(organizationId),
      deviceId: rule.deviceId,
      deletedAt: null,
      dateStartMs: { $lte: toMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: fromMs } }],
    })
      .select('_id')
      .lean();
    const recordIds = records.map((r) => r._id as Types.ObjectId);

    let rows: { _id: number; count: number; max: number | null; min: number | null; avg: number | null }[] = [];
    if (recordIds.length) {
      rows = await MetMeasure.aggregate([
        {
          $match: {
            recordId: { $in: recordIds },
            rowType: 'data',
            timestampMs: { $gte: fromMs, $lt: toMs },
            [field]: { $ne: null },
          },
        },
        {
          $group: {
            _id: { $multiply: [{ $floor: { $divide: ['$timestampMs', 60_000] } }, 60_000] },
            count: { $sum: 1 },
            max: { $max: `$${field}` },
            min: { $min: `$${field}` },
            avg: { $avg: `$${field}` },
          },
        },
        { $sort: { _id: 1 } },
      ] as PipelineStage[]);
    }

    // Every minute in the window appears, present or not: a gap in the data is
    // itself an answer to "why didn't it fire?", and a sparse series would hide
    // it by simply drawing a shorter line.
    const byTs = new Map(rows.map((r) => [r._id, r]));
    const buckets: BucketInput[] = [];
    for (let ts = fromMs; ts < toMs; ts += 60_000) {
      const r = byTs.get(ts);
      buckets.push({
        ts,
        count: r?.count ?? 0,
        max: r?.max ?? null,
        min: r?.min ?? null,
        avg: r?.avg ?? null,
      });
    }

    /**
     * Place each fire on the MEASUREMENT axis, which is what the buckets are
     * drawn on. `triggeredAt` is when the evaluator ran; while the agent drains
     * a backlog that can be hours after the wind it describes, and plotting it
     * as-is marks the alert over a stretch of calm. Entries written before
     * `measuredAtMs` existed have only the ingest time — they are still plotted,
     * but counted so the caller can say the axis is approximate for them.
     */
    const entries = (rule.triggerHistory ?? []).map((h) => ({
      ms: typeof h.measuredAtMs === 'number' ? h.measuredAtMs : new Date(h.triggeredAt).getTime(),
      exact: typeof h.measuredAtMs === 'number',
    }));
    if (rule.lastTriggeredAt && !entries.length) {
      entries.push({ ms: new Date(rule.lastTriggeredAt).getTime(), exact: false });
    }
    const inWindow = entries.filter((e) => e.ms >= fromMs && e.ms < toMs);
    const fires = [...new Set(inWindow.map((e) => e.ms))];
    const firesOnIngestTime = inWindow.filter((e) => !e.exact).length;
    const priorFires = entries.filter((e) => e.ms < fromMs).map((e) => e.ms);
    const priorFireMs = priorFires.length ? Math.max(...priorFires) : null;

    return {
      data: {
        ...head,
        supported: true,
        // The log is capped at 50 entries, so an older window can be missing
        // fires. Flag it rather than silently reporting them as "not_recorded".
        historyComplete: (rule.triggerHistory ?? []).length < 50,
        // How many plotted fires fall back to ingest time. Non-zero means some
        // markers may sit beside the reading that caused them, not on it.
        firesOnIngestTime,
        buckets: buildTimeline({
          buckets,
          condition: rule.condition as AlertCondition,
          thresholdStored,
          cooldownMs: rule.cooldownMinutes * 60_000,
          isActive: rule.isActive,
          fires,
          priorFireMs,
          toDisplay,
        }),
      },
    };
  }

  /**
   * Attach the reading in the RULE's unit to every log entry.
   *
   * The log stores the raw measurement in the SENSOR's unit (wind is m/s) while
   * the rule is written in the operator's (km/h). Rendering one with the other's
   * label showed "1.67 km/h" for a 1.67 m/s reading — below a 3 km/h threshold
   * it had in fact crossed. Converted HERE, next to the evaluator's own
   * conversion, so the two cannot drift apart in a client copy.
   */
  private withDisplayValues<T extends { sensor: string; unit?: string | null; triggerHistory?: unknown }>(rule: T): T {
    const history = (rule.triggerHistory ?? []) as {
      triggeredAt: Date;
      sensorValue: number;
      notifiedCount: number;
      measuredAtMs?: number | null;
    }[];
    if (!Array.isArray(history) || history.length === 0) return rule;
    return {
      ...rule,
      triggerHistory: history.map((h) => ({
        ...h,
        displayValue: valueInRuleUnit(rule.sensor, h.sensorValue, rule.unit ?? '', convertUnit),
        displayUnit: rule.unit ?? SENSOR_STORED_UNIT[rule.sensor] ?? '',
      })),
    };
  }

  private async resolveNotifyUsers(organizationId: string, ids?: string[]): Promise<Types.ObjectId[]> {
    if (!ids || ids.length === 0) return [];
    const valid = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (valid.length === 0) return [];
    const users = await User.find({ _id: { $in: valid }, organizationId: new Types.ObjectId(organizationId) })
      .select('_id')
      .lean();
    return users.map((u) => u._id as Types.ObjectId);
  }

  private audit(
    organizationId: string,
    actor: Actor,
    action: 'create' | 'update' | 'delete',
    resourceId: unknown,
    name: string,
    changes: Record<string, unknown> | null,
  ): void {
    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action,
      resourceType: 'alertRule',
      resourceId: String(resourceId),
      resourceName: name,
      changes,
    }).catch(() => void 0);
  }
}
