import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Organization, IOrganization } from '../models/Organization';
import { User, IUser, UserRole } from '../models/User';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { NepSession } from '../models/NepSession';
import { RefreshToken } from '../models/RefreshToken';
import { InviteToken } from '../models/InviteToken';
import { AuditLog } from '../models/AuditLog';
import { uploadFile, deleteFile } from '../utils/storage.util';
import { checkAccent, foregroundFor } from '../utils/contrast.util';
import { resolveRoleId, resolveRoleAssignment } from '../common/resolve-role';
import { sendInviteEmail } from '../utils/mailer';
import { signAccessToken, JWTPayload } from '../utils/jwt';

import { BCRYPT_COST } from '../common/bcrypt';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const INVITE_TOKEN_EXPIRY_DAYS = 7;
const VALID_ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

export interface BrandingInput {
  displayName: string;
  logoUrl: string;
  accentColor: string;
  supportEmail: string;
}

const badRequest = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });

interface ActorMeta {
  userId: string;
  email: string;
  /** The actor's own grants — a role assignment may never exceed them. */
  perms?: string[];
  sup?: boolean;
}

export interface UpdateOrgInput {
  name?: string;
  contactEmail?: string;
  country?: string;
  timezone?: string;
}

export interface InviteUserInput {
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserInput {
  role?: UserRole;
  /** A custom or system role by id. Takes precedence over `role` when both are sent. */
  roleId?: string | null;
  isActive?: boolean;
}

export interface CreateUserInput {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  roleId?: string | null;
}

export interface AcceptInviteInput {
  token?: string;
  password?: string;
}

function publicUser(user: IUser) {
  return {
    id: (user._id as Types.ObjectId).toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    mobileAppType: user.mobileAppType ?? null,
    lastLoginAt: user.lastLoginAt,
    invitedAt: user.invitedAt,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class OrganizationsService {
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async buildAuthResult(user: IUser, userAgent = '') {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: (user._id as Types.ObjectId).toString(),
      organizationId: user.organizationId.toString(),
      role: user.role,
      email: user.email,
    };
    const accessToken = signAccessToken(payload);

    const raw = this.generateRawToken();
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ userId: user._id, tokenHash, expiresAt, userAgent });

    return {
      user: {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId.toString(),
      },
      accessToken,
      refreshToken: raw,
    };
  }

  // ─── Organization ───────────────────────────────────────────────────────────

  async getOrganization(organizationId: string) {
    const org = await Organization.findById(organizationId);
    if (!org || org.deletedAt) {
      throw Object.assign(new Error('Organization not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    return org;
  }

  /**
   * Read this organisation's branding, with the fallbacks already applied.
   *
   * Resolved SERVER-SIDE so every surface — the shell, exports (W4), the public
   * share page — sees the same values. Doing it in each client would guarantee
   * they eventually disagree.
   */
  async getBranding(organizationId: string) {
    const org = await this.getOrganization(organizationId);
    const b = org.branding ?? ({} as IOrganization['branding']);
    const accentColor = b.accentColor ?? '';
    return {
      displayName: b.displayName?.trim() || org.name,
      logoUrl: b.logoUrl ?? '',
      accentColor,
      /**
       * The readable text colour for controls filled with the accent, DERIVED
       * here rather than stored. Deriving it server-side means the shell,
       * exports and share pages cannot each pick a different one — and the
       * customer is never asked to choose a foreground, which is one more way to
       * end up with an unreadable button.
       */
      accentForeground: accentColor ? foregroundFor(accentColor) : '',
      supportEmail: b.supportEmail ?? '',
      // `false` here is what tells the shell to render the platform default
      // rather than a half-applied theme.
      isCustomised: Boolean(b.displayName || b.logoUrl || b.accentColor),
      updatedAt: b.updatedAt ?? null,
    };
  }

  /**
   * Update branding. A customer may change their own; a platform administrator
   * switched into them edits theirs, because `organizationId` is re-pointed.
   *
   * Passing an empty string CLEARS a field back to the platform default — that
   * is deliberate, and is how a customer removes a logo or accent without a
   * separate "reset" endpoint.
   */
  async updateBranding(organizationId: string, input: Partial<BrandingInput>, actor: ActorMeta) {
    const org = await this.getOrganization(organizationId);
    const changes: Record<string, unknown> = {};

    if (input.displayName !== undefined) {
      const v = input.displayName.trim();
      if (v.length > 60) throw badRequest('The display name must be 60 characters or fewer');
      changes.displayName = v;
    }
    if (input.supportEmail !== undefined) {
      const v = input.supportEmail.trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest('Enter a valid support email');
      changes.supportEmail = v;
    }
    if (input.accentColor !== undefined) {
      const v = input.accentColor.trim().toLowerCase();
      // Stored as `#rrggbb` only. A named colour or `rgb()` would have to be
      // parsed again by every surface that renders it; W3 adds the contrast check.
      if (v && !/^#[0-9a-f]{6}$/.test(v)) throw badRequest('The accent colour must be a hex value like #1f6feb');
      if (v) {
        // Checked in BOTH themes. A colour that works in light mode and vanishes
        // in dark is still a broken panel, and whoever picked it is usually not
        // the person who finds out.
        const check = checkAccent(v);
        if (!check.passes) {
          throw badRequest(
            `That colour will not be readable: ${check.reasons.join('; ')}. Try a darker or more saturated shade.`,
            'ACCENT_CONTRAST',
          );
        }
      }
      changes.accentColor = v;
    }
    if (input.logoUrl !== undefined) {
      const v = input.logoUrl.trim();
      if (v.length > 512) throw badRequest('That logo URL is too long');
      changes.logoUrl = v;
    }

    if (Object.keys(changes).length === 0) return this.getBranding(organizationId);

    await Organization.updateOne(
      { _id: org._id },
      { $set: Object.fromEntries(Object.entries({ ...changes, updatedAt: new Date() }).map(([k, v]) => [`branding.${k}`, v])) },
    );

    AuditLog.create({
      organizationId: org._id,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'organization',
      resourceId: String(org._id),
      resourceName: org.name,
      changes,
    }).catch(() => void 0);

    return this.getBranding(organizationId);
  }

  /**
   * Store a logo and point the branding at it.
   *
   * The PREVIOUS logo is deleted from storage after the new one is saved — in
   * that order, so a failed upload never leaves the customer with no logo at
   * all. A failed delete is swallowed: an orphaned file costs pennies, a failed
   * request costs the customer their branding.
   */
  async uploadLogo(
    organizationId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    actor: ActorMeta,
  ) {
    const org = await this.getOrganization(organizationId);
    const previous = org.branding?.logoStorageKey ?? '';

    const uploaded = await uploadFile(`branding/${organizationId}`, file.originalname, file.buffer, file.mimetype);

    await Organization.updateOne(
      { _id: org._id },
      { $set: { 'branding.logoUrl': uploaded.url, 'branding.logoStorageKey': uploaded.storageKey, 'branding.updatedAt': new Date() } },
    );

    if (previous && previous !== uploaded.storageKey) {
      await deleteFile(previous, 'image').catch(() => void 0);
    }

    AuditLog.create({
      organizationId: org._id,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'organization',
      resourceId: String(org._id),
      resourceName: org.name,
      changes: { logoUrl: uploaded.url },
    }).catch(() => void 0);

    return this.getBranding(organizationId);
  }

  /** Remove the logo and fall back to the wordmark. */
  async removeLogo(organizationId: string, actor: ActorMeta) {
    const org = await this.getOrganization(organizationId);
    const key = org.branding?.logoStorageKey ?? '';

    await Organization.updateOne(
      { _id: org._id },
      { $set: { 'branding.logoUrl': '', 'branding.logoStorageKey': '', 'branding.updatedAt': new Date() } },
    );
    // Cleared in the database FIRST: if the storage delete fails the customer
    // still sees the logo gone, which is what they asked for.
    if (key) await deleteFile(key, 'image').catch(() => void 0);

    AuditLog.create({
      organizationId: org._id,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'organization',
      resourceId: String(org._id),
      resourceName: org.name,
      changes: { logoUrl: '' },
    }).catch(() => void 0);

    return this.getBranding(organizationId);
  }

  async updateOrganization(organizationId: string, input: UpdateOrgInput, actor: ActorMeta) {
    const org = await this.getOrganization(organizationId);

    const changes: Record<string, unknown> = {};
    (['name', 'contactEmail', 'country', 'timezone'] as const).forEach((key) => {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        (org as unknown as Record<string, unknown>)[key] = value.trim();
        changes[key] = value.trim();
      }
    });

    await org.save();

    AuditLog.create({
      organizationId: org._id,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'settings',
      resourceId: (org._id as Types.ObjectId).toString(),
      resourceName: org.name,
      changes: Object.keys(changes).length ? changes : null,
    }).catch(() => void 0);

    return org;
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  async listUsers(organizationId: string) {
    const users = await User.find({ organizationId: new Types.ObjectId(organizationId), deletedAt: null })
      .sort({ createdAt: 1 });
    return users.map(publicUser);
  }

  /**
   * Mobile users for the admin panel's Users page: everyone who signed up from a
   * mobile app (User.mobileAppType) or has app activity (uploads / registered
   * devices attributed via the userId fields), with per-user upload stats and the
   * devices they touched. Legacy users without a signup appType are classified by
   * what they uploaded.
   */
  async listMobileUsers(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);

    const activityGroup = {
      _id: '$userId',
      count: { $sum: 1 },
      lastAt: { $max: '$syncedAt' },
      devices: { $addToSet: '$deviceId' },
    };

    const [users, recAgg, sessAgg, devices] = await Promise.all([
      User.find({ organizationId: orgId }).sort({ createdAt: 1 }).lean(),
      MetRecord.aggregate([
        { $match: { organizationId: orgId, deletedAt: null, userId: { $ne: null } } },
        { $group: activityGroup },
      ]),
      NepSession.aggregate([
        { $match: { organizationId: orgId, deletedAt: null, userId: { $ne: null } } },
        { $group: activityGroup },
      ]),
      Device.find({ organizationId: orgId, deletedAt: null })
        .select('_id name customName type registeredByUserId')
        .lean(),
    ]);

    const deviceInfo = new Map(
      devices.map((d) => [
        (d._id as Types.ObjectId).toString(),
        { id: (d._id as Types.ObjectId).toString(), name: d.customName ?? d.name, type: d.type },
      ]),
    );
    type ActivityRow = { _id: Types.ObjectId; count: number; lastAt: Date | null; devices: Types.ObjectId[] };
    const recByUser = new Map((recAgg as ActivityRow[]).map((r) => [r._id.toString(), r]));
    const sessByUser = new Map((sessAgg as ActivityRow[]).map((r) => [r._id.toString(), r]));

    return users
      .map((u) => {
        const id = (u._id as Types.ObjectId).toString();
        const rec = recByUser.get(id);
        const sess = sessByUser.get(id);

        const deviceIds = new Set<string>(
          [...(rec?.devices ?? []), ...(sess?.devices ?? [])].map((d) => d.toString()),
        );
        for (const d of devices) {
          if (d.registeredByUserId && d.registeredByUserId.toString() === id) {
            deviceIds.add((d._id as Types.ObjectId).toString());
          }
        }

        const metRecordCount = rec?.count ?? 0;
        const nepSessionCount = sess?.count ?? 0;
        const lastDates = [rec?.lastAt, sess?.lastAt].filter((d): d is Date => d != null);
        const lastUploadAt = lastDates.length
          ? new Date(Math.max(...lastDates.map((d) => new Date(d).getTime())))
          : null;

        return {
          id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          isActive: u.isActive,
          mobileAppType: u.mobileAppType ?? null,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt ?? null,
          metRecordCount,
          nepSessionCount,
          lastUploadAt,
          devices: [...deviceIds].map((did) => deviceInfo.get(did)).filter((d) => d != null),
        };
      })
      .filter((r) => r.mobileAppType || r.metRecordCount > 0 || r.nepSessionCount > 0 || r.devices.length > 0);
  }

  /**
   * Create a user in this organisation with a password set directly.
   *
   * WHY THIS EXISTS
   * `inviteUser` below is disabled (M15 W3) because there is no invitation email in
   * this deployment, and M19 W4 replaced it only for the FIRST admin of a brand new
   * customer. That left every organisation permanently at one user: no route
   * anywhere could add a second, so `user:write` had nothing to write. This is the
   * missing route, and it deliberately mirrors the M19 W4 flow — active
   * immediately, password shown to the operator once, no email.
   */
  async createUser(organizationId: string, input: CreateUserInput, actor: ActorMeta) {
    const email = input.email?.toLowerCase().trim();
    if (!email) {
      throw Object.assign(new Error('email is required'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    }
    if (!input.password || input.password.length < 8) {
      throw Object.assign(new Error('password must be at least 8 characters'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    // Global, not per-organisation: `User.email` is uniquely indexed across the
    // whole platform, so a duplicate must be refused here rather than surfacing as
    // an E11000 the caller cannot interpret.
    const existing = await User.findOne({ email }).select('_id').lean();
    if (existing) {
      throw Object.assign(new Error('A user with this email already exists'), {
        statusCode: 409,
        code: 'EMAIL_EXISTS',
      });
    }

    const assigned = await resolveRoleAssignment(
      { role: input.role, roleId: input.roleId },
      organizationId,
      'viewer',
      actor,
    );

    const user = await User.create({
      organizationId: new Types.ObjectId(organizationId),
      email,
      // Same cost as every other creation path. M24 W1 found the customer-admin
      // path had drifted to 10 while the rest of the codebase used 12.
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      firstName: input.firstName?.trim() || email.split('@')[0],
      lastName: input.lastName?.trim() || '',
      role: assigned.role,
      roleId: assigned.roleId,
      isActive: true,
    });

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'create',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: user.email,
      // Never the password. M21 W1 proved a leaked secret in a stored result does
      // not survive review; the same rule applies to the audit log.
      changes: { role: assigned.role, roleId: assigned.roleId ? String(assigned.roleId) : null },
    }).catch(() => void 0);

    return publicUser(user);
  }

  /**
   * Soft-delete a user and end their sessions.
   *
   * Soft, because `AuditLog` entries name the actor by id: a hard delete would turn
   * every historical entry into an unresolvable reference. The email is released
   * so the address can be re-added later — `User.email` is uniquely indexed, and
   * without this a person who left could never be given an account again.
   */
  async deleteUser(organizationId: string, targetUserId: string, actor: ActorMeta): Promise<void> {
    if (targetUserId === actor.userId) {
      throw Object.assign(new Error('You cannot remove your own account'), {
        statusCode: 400,
        code: 'CANNOT_MODIFY_SELF',
      });
    }
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    const user = await User.findOne({
      _id: new Types.ObjectId(targetUserId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    });
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (user.role === 'admin' && user.isActive) {
      const activeAdmins = await User.countDocuments({
        organizationId: new Types.ObjectId(organizationId),
        role: 'admin',
        isActive: true,
        deletedAt: null,
      });
      if (activeAdmins <= 1) {
        throw Object.assign(new Error('Organization must have at least one active admin'), {
          statusCode: 400,
          code: 'LAST_ADMIN',
        });
      }
    }

    const originalEmail = user.email;
    user.deletedAt = new Date();
    user.isActive = false;
    // Tombstoned rather than cleared: the address is freed for re-use while the row
    // remains readable to anyone auditing what happened.
    user.email = `deleted+${String(user._id)}@${originalEmail.split('@')[1] ?? 'invalid'}`;
    await user.save();

    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'delete',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: originalEmail,
      changes: null,
    }).catch(() => void 0);
  }

  async inviteUser(organizationId: string, input: InviteUserInput, actor: ActorMeta) {
    const email = input.email?.toLowerCase().trim();
    if (!email) {
      throw Object.assign(new Error('email is required'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    }
    const role = input.role ?? 'viewer';
    if (!VALID_ROLES.includes(role)) {
      throw Object.assign(new Error(`role must be one of: ${VALID_ROLES.join(', ')}`), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      throw Object.assign(new Error('A user with this email already exists'), {
        statusCode: 409,
        code: 'EMAIL_EXISTS',
      });
    }

    // Placeholder hash — the account cannot be logged into until the invite is
    // accepted and a real password is set.
    const placeholderHash = await bcrypt.hash(this.generateRawToken(), BCRYPT_COST);

    const user = await User.create({
      organizationId: new Types.ObjectId(organizationId),
      email,
      passwordHash: placeholderHash,
      firstName: input.firstName?.trim() || email.split('@')[0],
      lastName: input.lastName?.trim() || '',
      role,
      roleId: await resolveRoleId(role, organizationId),
      isActive: false,
      invitedAt: new Date(),
      invitedBy: new Types.ObjectId(actor.userId),
    });

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await InviteToken.create({
      userId: user._id,
      organizationId: new Types.ObjectId(organizationId),
      email,
      tokenHash,
      role,
      invitedBy: new Types.ObjectId(actor.userId),
      expiresAt,
    });

    // Points at the admin-web (frontend) origin — the accept-invite PAGE lives
    // there, not on the backend. `FRONTEND_URL` is the admin-web origin.
    const inviteUrl = `${(process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/accept-invite?token=${rawToken}`;

    const org = await Organization.findById(organizationId);
    try {
      await sendInviteEmail(email, org?.name ?? 'Observator', actor.email, role, inviteUrl);
    } catch (err) {
      console.error('[mailer] Failed to send invite email:', err);
      if (process.env.NODE_ENV === 'development') throw err;
    }

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'invite',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: email,
      changes: { role },
    }).catch(() => void 0);

    const result: { user: ReturnType<typeof publicUser>; devToken?: string } = {
      user: publicUser(user),
    };
    if (process.env.NODE_ENV === 'development') {
      result.devToken = rawToken;
    }
    return result;
  }

  /**
   * Every customer organisation. PLATFORM ADMINISTRATORS ONLY.
   *
   * This is one of the very few queries that deliberately spans tenants, so the
   * super-admin check is re-read from the database rather than taken from the
   * token — a demoted admin holding a valid token must not be able to enumerate
   * the customer list.
   */
  async listAll(actorUserId: string) {
    const actor = await User.findById(actorUserId).select('isSuperAdmin isActive').lean();
    if (!actor || actor.isActive === false || actor.isSuperAdmin !== true) {
      throw Object.assign(new Error('Only a platform administrator can list organisations'), {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    const orgs = await Organization.find({ deletedAt: null })
      .select('name slug timezone country createdAt')
      .sort({ name: 1 })
      .lean();

    // One grouped query each rather than two per organisation.
    const ids = orgs.map((o) => o._id);
    const [devices, users] = await Promise.all([
      Device.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: ids }, deletedAt: null } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
      User.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: ids } } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
    ]);
    const dev = new Map(devices.map((d) => [String(d._id), d.n]));
    const usr = new Map(users.map((u) => [String(u._id), u.n]));

    return orgs.map((o) => ({
      _id: String(o._id),
      name: o.name,
      slug: o.slug,
      timezone: o.timezone,
      country: o.country ?? null,
      deviceCount: dev.get(String(o._id)) ?? 0,
      userCount: usr.get(String(o._id)) ?? 0,
      createdAt: o.createdAt,
    }));
  }

  async updateUser(
    organizationId: string,
    targetUserId: string,
    input: UpdateUserInput,
    actor: ActorMeta,
  ) {
    if (targetUserId === actor.userId) {
      throw Object.assign(new Error('You cannot change your own role or status'), {
        statusCode: 400,
        code: 'CANNOT_MODIFY_SELF',
      });
    }
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    const user = await User.findOne({
      _id: new Types.ObjectId(targetUserId),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    // Resolve the role FIRST, so the last-admin guard below sees the role the user
    // would actually end up with. Reading `input.role` alone would miss a demotion
    // driven by `roleId` — assigning a viewer-based custom role to the only admin
    // would then lock the organisation out with nobody able to administer it.
    if (input.role !== undefined && !VALID_ROLES.includes(input.role)) {
      throw Object.assign(new Error(`role must be one of: ${VALID_ROLES.join(', ')}`), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    const assigned =
      input.role !== undefined || input.roleId !== undefined
        ? await resolveRoleAssignment({ role: input.role, roleId: input.roleId }, user.organizationId, user.role, actor)
        : null;

    const demotingAdmin = user.role === 'admin' && assigned !== null && assigned.role !== 'admin';
    const deactivating = input.isActive === false && user.isActive;

    if ((demotingAdmin || deactivating) && user.role === 'admin' && user.isActive) {
      const activeAdmins = await User.countDocuments({
        organizationId: new Types.ObjectId(organizationId),
        role: 'admin',
        isActive: true,
      });
      if (activeAdmins <= 1) {
        throw Object.assign(new Error('Organization must have at least one active admin'), {
          statusCode: 400,
          code: 'LAST_ADMIN',
        });
      }
    }

    const changes: Record<string, unknown> = {};
    if (assigned) {
      // `roleId` and `role` move TOGETHER, always, or the two drift: PermissionsGuard
      // would read one role and RolesGuard the other.
      changes.role = assigned.role;
      if (input.roleId !== undefined) changes.roleId = assigned.roleId ? String(assigned.roleId) : null;
      user.role = assigned.role;
      user.roleId = assigned.roleId;
    }
    if (input.isActive !== undefined) {
      changes.isActive = input.isActive;
      user.isActive = input.isActive;
    }

    await user.save();

    // If the user was deactivated, kill their active sessions.
    if (input.isActive === false) {
      await RefreshToken.updateMany(
        { userId: user._id, revokedAt: null },
        { revokedAt: new Date() },
      );
    }

    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: input.isActive === false ? 'revoke' : 'update',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: user.email,
      changes: Object.keys(changes).length ? changes : null,
    }).catch(() => void 0);

    return publicUser(user);
  }

  // ─── Invite acceptance (public) ───────────────────────────────────────────────

  async acceptInvite(input: AcceptInviteInput) {
    if (!input.token || !input.password) {
      throw Object.assign(new Error('token and password are required'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    if (input.password.length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters'), {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    }

    const tokenHash = this.hashToken(input.token);
    const record = await InviteToken.findOne({ tokenHash });
    if (!record) {
      throw Object.assign(new Error('Invalid or expired invite token'), {
        statusCode: 400,
        code: 'INVALID_INVITE_TOKEN',
      });
    }
    if (record.usedAt) {
      throw Object.assign(new Error('Invite already accepted'), {
        statusCode: 400,
        code: 'TOKEN_ALREADY_USED',
      });
    }
    if (record.expiresAt < new Date()) {
      throw Object.assign(new Error('Invite token expired'), { statusCode: 400, code: 'TOKEN_EXPIRED' });
    }

    const user = await User.findById(record.userId);
    if (!user) {
      throw Object.assign(new Error('Invited user no longer exists'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    user.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    user.isActive = true;
    user.lastLoginAt = new Date();
    await user.save();

    record.usedAt = new Date();
    await record.save();
    // Clean up any other outstanding invites for this user.
    await InviteToken.deleteMany({ userId: user._id, usedAt: null });

    AuditLog.create({
      organizationId: user.organizationId,
      userId: user._id,
      userEmail: user.email,
      action: 'update',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: user.email,
      changes: { acceptedInvite: true },
    }).catch(() => void 0);

    return this.buildAuthResult(user);
  }
}
