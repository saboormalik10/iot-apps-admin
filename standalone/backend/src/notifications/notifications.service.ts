import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { Notification, NotificationType } from '../models/Notification';
import { User } from '../models/User';
import { DomainEvent, NotificationEvent } from '../realtime/realtime.events';

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
  ) {}

  /**
   * Central delivery seam used by alerts, session-complete and firmware.
   * Persists a Notification per target user (feed) and pushes it live over the
   * WebSocket gateway to the browser — the "web alert" the client asked for.
   * The cloud portal also sent mobile push (FCM/APNs); the standalone has no
   * mobile apps and no internet, so that hand-off is gone.
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


}
