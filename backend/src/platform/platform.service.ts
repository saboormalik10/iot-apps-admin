import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';

import { Organization } from '../models/Organization';
import { Device } from '../models/Device';
import { User } from '../models/User';
import { MetRecord } from '../models/MetRecord';
import { AlertRule } from '../models/AlertRule';
import { StationAccount } from '../models/StationAccount';
import { AuditLog } from '../models/AuditLog';
import { resolveRoleId } from '../common/resolve-role';
import { isSafeFolderPath, normaliseFolderPath } from '../ingest/folder-path';

import { BCRYPT_COST } from '../common/bcrypt';

export interface CreateCustomerInput {
  name: string;
  /** Defaults to the administrator's email — the service applies that. */
  contactEmail?: string;
  country?: string;
  timezone?: string;
  uploadFolder?: string;
  admin: { email: string; password: string; firstName: string; lastName: string };
}

const badReq = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });

/** "Acme Marine Services" → "acme-marine-services". */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Minutes within which a station counts as online, matching devices.service. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export interface CustomerRow {
  organizationId: string;
  name: string;
  timezone: string;
  stations: number;
  online: number;
  users: number;
  alertRules: number;
  readings24h: number;
  lastDataAt: string | null;
  uploadFolders: string[];
}

export interface PlatformOverview {
  customers: number;
  stations: number;
  online: number;
  users: number;
  readings24h: number;
  /** Customers whose newest reading is older than the staleness window. */
  silent: number;
  rows: CustomerRow[];
  generatedAt: string;
}

/**
 * Cross-customer reporting.
 *
 * THE ONLY SERVICE IN THE CODEBASE THAT DELIBERATELY READS ACROSS TENANTS.
 * Everything else derives its scope from the caller's `organizationId`; here the
 * absence of that filter is the point, which is why the routes sit behind their
 * own `SuperAdminGuard` rather than a permission that could be granted by
 * mistake.
 *
 * Every figure comes from a GROUPED aggregation rather than a per-customer loop:
 * at 50 customers the loop would be ~250 round trips per page load.
 */
@Injectable()
export class PlatformService {
  async overview(): Promise<PlatformOverview> {
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;

    const orgs = await Organization.find({ deletedAt: null }).select('name timezone').sort({ name: 1 }).lean();
    const orgIds = orgs.map((o) => o._id as Types.ObjectId);

    const [devices, users, rules, readings, folders] = await Promise.all([
      Device.aggregate<{ _id: Types.ObjectId; total: number; online: number; lastSeenAt: Date | null }>([
        { $match: { organizationId: { $in: orgIds }, deletedAt: null } },
        {
          $group: {
            _id: '$organizationId',
            total: { $sum: 1 },
            // Recomputed from the timestamp rather than trusting the stored
            // `isOnline` flag, which nothing clears when a station goes quiet.
            online: { $sum: { $cond: [{ $gte: ['$lastSeenAt', new Date(now - ONLINE_WINDOW_MS)] }, 1, 0] } },
            lastSeenAt: { $max: '$lastSeenAt' },
          },
        },
      ]),
      User.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: orgIds } } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
      AlertRule.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: orgIds }, deletedAt: null, isActive: true } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
      // Summed from the per-day records, NOT counted over MetMeasure: the day
      // record already holds `measureCount`, so this is a handful of documents
      // per station instead of a scan of tens of millions.
      MetRecord.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: orgIds }, dateEndMs: { $gte: since } } },
        { $group: { _id: '$organizationId', n: { $sum: '$measureCount' } } },
      ]),
      StationAccount.aggregate<{ _id: Types.ObjectId; folders: string[] }>([
        { $match: { organizationId: { $in: orgIds }, isActive: true } },
        { $group: { _id: '$organizationId', folders: { $addToSet: '$folderPath' } } },
      ]),
    ]);

    const byId = <T extends { _id: Types.ObjectId }>(rows: T[]) => new Map(rows.map((r) => [String(r._id), r]));
    const dev = byId(devices);
    const usr = byId(users);
    const alr = byId(rules);
    const rdg = byId(readings);
    const fld = byId(folders);

    const rows: CustomerRow[] = orgs.map((o) => {
      const id = String(o._id);
      const d = dev.get(id);
      return {
        organizationId: id,
        name: o.name,
        timezone: o.timezone || 'UTC',
        stations: d?.total ?? 0,
        online: d?.online ?? 0,
        users: usr.get(id)?.n ?? 0,
        alertRules: alr.get(id)?.n ?? 0,
        readings24h: rdg.get(id)?.n ?? 0,
        lastDataAt: d?.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : null,
        uploadFolders: (fld.get(id)?.folders ?? []).map((f) => f || '(root)').sort(),
      };
    });

    const sum = (pick: (r: CustomerRow) => number) => rows.reduce((n, r) => n + pick(r), 0);

    return {
      customers: rows.length,
      stations: sum((r) => r.stations),
      online: sum((r) => r.online),
      users: sum((r) => r.users),
      readings24h: sum((r) => r.readings24h),
      // A customer with stations but nothing in 24h is the one worth chasing.
      silent: rows.filter((r) => r.stations > 0 && r.readings24h === 0).length,
      rows,
      generatedAt: new Date(now).toISOString(),
    };
  }

  /**
   * Create a customer and its first administrator, in one step.
   *
   * NO EMAIL INVITE: the platform administrator sets the password directly and
   * hands it over, which is what the client asked for. The account is active
   * immediately, so there is no pending-invite state to get stuck in.
   *
   * The organisation and its first user are created together — an organisation
   * nobody can sign in to is not a usable customer, so a half-completed create
   * would need manual repair.
   */
  async createCustomer(input: CreateCustomerInput, actor: { userId: string; email: string }) {
    const name = (input.name ?? '').trim();
    if (!name) throw badReq('name is required');

    const adminEmail = (input.admin?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw badReq('A valid administrator email is required');
    if ((input.admin?.password ?? '').length < 8) throw badReq('The password must be at least 8 characters');

    const slug = slugify(name);
    if (!slug) throw badReq('name must contain at least one letter or digit');

    // The folder defaults to the display name, NOT the slug: it has to match what
    // someone types into the logger, and the client's own folder is `Demo Tower`
    // — spaces and capitals included.
    const uploadFolder = normaliseFolderPath(input.uploadFolder?.trim() || name);
    if (!isSafeFolderPath(uploadFolder) || uploadFolder.includes('/')) {
      throw badReq('The upload folder must be a single folder name, without slashes');
    }

    const [slugClash, emailClash, folderClash] = await Promise.all([
      Organization.findOne({ slug, deletedAt: null }).lean(),
      User.findOne({ email: adminEmail }).lean(),
      Organization.findOne({ uploadFolder, deletedAt: null }).lean(),
    ]);
    if (slugClash) throw badReq(`A customer named "${name}" already exists`, 'DUPLICATE_ORGANIZATION');
    if (emailClash) throw badReq(`${adminEmail} already has an account`, 'EMAIL_EXISTS');
    // Two customers sharing a folder would route one's data to the other.
    if (folderClash) throw badReq(`The folder "${uploadFolder}" is already used by another customer`, 'DUPLICATE_FOLDER');

    const org = await Organization.create({
      name,
      slug,
      contactEmail: (input.contactEmail ?? adminEmail).trim().toLowerCase(),
      country: (input.country ?? 'AU').trim(),
      timezone: (input.timezone ?? 'UTC').trim(),
      uploadFolder,
    });

    try {
      const passwordHash = await bcrypt.hash(input.admin.password, BCRYPT_COST);
      const user = await User.create({
        organizationId: org._id,
        email: adminEmail,
        passwordHash,
        firstName: input.admin.firstName.trim(),
        lastName: input.admin.lastName.trim(),
        role: 'admin',
        // Written together with `role`, always — a user with no roleId cannot hold
        // a custom role and is invisible to the role-usage counts.
        roleId: await resolveRoleId('admin', org._id as Types.ObjectId),
        isActive: true,
      });

      AuditLog.create({
        organizationId: org._id,
        userId: new Types.ObjectId(actor.userId),
        userEmail: actor.email,
        action: 'create',
        resourceType: 'organization',
        resourceId: String(org._id),
        resourceName: org.name,
        changes: { uploadFolder, adminEmail },
      }).catch(() => void 0);

      return {
        organizationId: String(org._id),
        name: org.name,
        slug: org.slug,
        uploadFolder,
        timezone: org.timezone,
        admin: { id: String(user._id), email: user.email },
      };
    } catch (err) {
      // Roll the organisation back rather than leaving one nobody can sign in to.
      await Organization.deleteOne({ _id: org._id }).catch(() => void 0);
      throw err;
    }
  }
}
