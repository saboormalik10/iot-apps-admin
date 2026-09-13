import { Injectable } from '@nestjs/common';
import { Types, FilterQuery } from 'mongoose';
import { AuditLog, IAuditLog, AuditAction, AuditResourceType } from '../models/AuditLog';

export interface ListAuditInput {
  /**
   * One action, or several as a comma-separated list.
   *
   * The list exists for one question the page could not ask: "what CHANGED?".
   * Sign-ins are 78% of the log (2,307 of 2,956 here), so every write a person
   * is looking for sits behind pages of them, and a single-value filter can only
   * narrow to one action at a time.
   */
  action?: AuditAction | string;
  resourceType?: AuditResourceType;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  async listAuditLogs(organizationId: string, input: ListAuditInput) {
    const page = Math.max(input.page ?? 1, 1);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

    const filter: FilterQuery<IAuditLog> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (input.action) {
      // Split, trim and drop empties so a trailing comma cannot turn into a
      // filter on the empty string, which matches nothing and looks like a bug.
      const actions = String(input.action)
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      if (actions.length === 1) filter.action = actions[0] as AuditAction;
      else if (actions.length > 1) filter.action = { $in: actions as AuditAction[] };
    }
    if (input.resourceType) filter.resourceType = input.resourceType;
    if (input.userId && Types.ObjectId.isValid(input.userId)) {
      filter.userId = new Types.ObjectId(input.userId);
    }
    if (input.from || input.to) {
      filter.createdAt = {};
      if (input.from) (filter.createdAt as Record<string, Date>).$gte = new Date(input.from);
      if (input.to) (filter.createdAt as Record<string, Date>).$lte = new Date(input.to);
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
