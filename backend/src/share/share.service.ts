import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { ShareToken } from '../models/ShareToken';
import { NepSession } from '../models/NepSession';
import { MetRecord } from '../models/MetRecord';
import { AuditLog } from '../models/AuditLog';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type ResourceType = 'nepSession' | 'metRecord';

@Injectable()
export class ShareService {
  async createShare(
    organizationId: string,
    body: { resourceType: ResourceType; resourceId: string; expiresAt?: string },
    actor: { userId: string; email: string },
  ) {
    await this.assertResource(organizationId, body.resourceType, body.resourceId);

    const token = 'shr_' + randomBytes(24).toString('hex');
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + DEFAULT_TTL_MS);

    const doc = await ShareToken.create({
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(actor.userId),
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      token,
      expiresAt,
    });

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'create',
      resourceType: 'shareToken',
      resourceId: (doc._id as Types.ObjectId).toString(),
      resourceName: `${body.resourceType}:${body.resourceId}`,
      changes: null,
    }).catch(() => void 0);

    const base = (process.env.PUBLIC_SHARE_BASE_URL ?? '').replace(/\/$/, '');
    return {
      _id: doc._id,
      token,
      url: base ? `${base}/public/${token}` : `/v1/public/${token}`,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    };
  }

  async listShares(organizationId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const filter = { organizationId: new Types.ObjectId(organizationId) };
    const [items, total] = await Promise.all([
      ShareToken.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
      ShareToken.countDocuments(filter),
    ]);
    return {
      data: items,
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  /**
   * Revoke a share link.
   *
   * `canRevokeAny` decides SCOPE, not access: without it the filter is narrowed to
   * links the actor created, so someone else's link is a 404 rather than a 403 —
   * the same answer they would get for a link that never existed, which is what we
   * want, since "wrong permission" would confirm the link is real.
   */
  async revokeShare(
    organizationId: string,
    id: string,
    actor: { userId: string; email: string },
    canRevokeAny = false,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw Object.assign(new Error('Share not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    const doc = await ShareToken.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        revokedAt: null,
        ...(canRevokeAny ? {} : { createdBy: new Types.ObjectId(actor.userId) }),
      },
      { $set: { revokedAt: new Date() } },
      { new: true },
    );
    if (!doc) {
      throw Object.assign(new Error('Share not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'revoke',
      resourceType: 'shareToken',
      resourceId: (doc._id as Types.ObjectId).toString(),
      resourceName: `${doc.resourceType}:${doc.resourceId}`,
      changes: null,
    }).catch(() => void 0);
  }

  private async assertResource(organizationId: string, resourceType: ResourceType, resourceId: string): Promise<void> {
    const orgId = new Types.ObjectId(organizationId);
    if (resourceType === 'nepSession') {
      const exists = await NepSession.exists({ id: resourceId, organizationId: orgId, deletedAt: null });
      if (!exists) throw Object.assign(new Error('NEP session not found'), { statusCode: 404, code: 'NOT_FOUND' });
    } else {
      if (!Types.ObjectId.isValid(resourceId)) {
        throw Object.assign(new Error('MET record not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }
      const exists = await MetRecord.exists({ _id: new Types.ObjectId(resourceId), organizationId: orgId, deletedAt: null });
      if (!exists) throw Object.assign(new Error('MET record not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
  }
}
