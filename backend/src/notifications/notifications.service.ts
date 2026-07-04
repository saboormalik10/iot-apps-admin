import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { Notification, NotificationType } from '../models/Notification';
import { NotificationToken } from '../models/NotificationToken';
import { User } from '../models/User';
import { DomainEvent, NotificationEvent } from '../realtime/realtime.events';
import { PushService } from './push.service';

const TOKEN_TTL_DAYS = 60;

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
  ) {}

  /**
   * Central delivery seam used by alerts, session-complete and firmware.
   * Persists a Notification per target user (feed), pushes it live over the
   * WebSocket gateway, and hands off to PushService (env-gated no-op for now).
   * `userIds` null/empty → every active user in the org.
   */
  async notify(
    organizationId: string,
    userIds: string[] | null,
    payload: NotifyPayload,
  ): Promise<void> {
    let targetIds = (userIds ?? []).filter((id) => Types.ObjectId.isValid(id));
    if (targetIds.length === 0) {
      const users = await User.find({
        organizationId: new Types.ObjectId(organizationId),
        isActive: { $ne: false },
      })
        .select('_id')
        .lean();
      targetIds = users.map((u) => (u._id as Types.ObjectId).toString());
    }
    if (targetIds.length === 0) return;

    const body = payload.body ?? '';
    const data = payload.data ?? null;

    await Notification.insertMany(
      targetIds.map((uid) => ({
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(uid),
        type: payload.type,
        title: payload.title,
        body,
        data,
      })),
    );

    const event: NotificationEvent = {
      organizationId,
      userIds: targetIds,
      notification: { type: payload.type, title: payload.title, body, data, createdAt: new Date() },
    };
    this.eventEmitter.emit(DomainEvent.NOTIFICATION, event);

    this.pushService
      .sendToOrg(organizationId, { title: payload.title, body, data })
      .catch(() => void 0);
  }

  // ── Feed ──────────────────────────────────────────────────────────────────

  async listForUser(
    organizationId: string,
    userId: string,
    opts: { unread?: boolean; page?: number; limit?: number },
  ) {
    const page = Math.max(opts.page ?? 1, 1);
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const base = {
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
    };
    const filter: Record<string, unknown> = { ...base };
    if (opts.unread) filter.readAt = null;

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...base, readAt: null }),
    ]);

    return {
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount,
    };
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    const doc = await Notification.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!doc) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    return doc;
  }

  async markAllRead(organizationId: string, userId: string) {
    const res = await Notification.updateMany(
      {
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
        readAt: null,
      },
      { $set: { readAt: new Date() } },
    );
    return { updated: res.modifiedCount };
  }

  // ── Device push tokens ──────────────────────────────────────────────────────

  async registerToken(
    organizationId: string,
    userId: string,
    body: { platform: 'ios' | 'android'; token: string; appId: string; deviceModel?: string },
  ) {
    if (!body.token || !body.platform || !body.appId) {
      throw Object.assign(new Error('platform, token and appId are required'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
    const doc = await NotificationToken.findOneAndUpdate(
      { token: body.token },
      {
        $set: {
          userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null,
          organizationId: new Types.ObjectId(organizationId),
          platform: body.platform,
          appId: body.appId,
          deviceModel: body.deviceModel ?? '',
          expiresAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc;
  }

  async unregisterToken(organizationId: string, token: string) {
    await NotificationToken.deleteOne({ token, organizationId: new Types.ObjectId(organizationId) });
  }

  async listTokens(organizationId: string) {
    return NotificationToken.find({ organizationId: new Types.ObjectId(organizationId) })
      .select('platform appId deviceModel userId createdAt expiresAt')
      .sort({ createdAt: -1 })
      .lean();
  }
}
