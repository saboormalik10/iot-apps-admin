import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AlertRule } from '../models/AlertRule';
import { Device } from '../models/Device';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
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
    return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async get(organizationId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const rule = await AlertRule.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!rule) throw notFound();
    return rule;
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
