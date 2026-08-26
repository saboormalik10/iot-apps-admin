import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { sendPasswordResetCodeEmail } from '../utils/mailer';
import { Organization } from '../models/Organization';
import { User, IUser } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { AuditLog } from '../models/AuditLog';
import { signAccessToken, signWsTicket, JWTPayload } from '../utils/jwt';
import { Role } from '../models/Role';
import { resolveRoleId } from '../common/resolve-role';
import { SEEDED_ROLES, sanitizePermissions } from '../common/permissions';
import { slugify } from '../utils/slug';

import { BCRYPT_COST } from '../common/bcrypt';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
// Password-reset OTP: a 6-digit code, then a single-use reset token after verify.
const RESET_CODE_EXPIRY_MINUTES = 15;
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;

export interface RegisterInput {
  orgName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  country: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface MobileSignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Which app is signing the user up — shown on the admin panel's Users page. */
  appType?: 'MET-LINK' | 'NEP-LINK';
  userAgent?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
  };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Resolve a user's permission grants from their assigned role.
   *
   * Falls back to the seeded set for their legacy `role` key when no roleId is
   * attached — a user created before the migration, or one whose role was
   * deleted, still gets exactly what their role key always implied.
   */
  private async resolvePermissions(user: IUser): Promise<string[]> {
    if (user.roleId) {
      const role = await Role.findOne({ _id: user.roleId, deletedAt: null }).select('permissions').lean();
      if (role) return sanitizePermissions(role.permissions);
    }
    const seeded = SEEDED_ROLES.find((r) => r.key === user.role);
    return seeded ? sanitizePermissions(seeded.permissions) : [];
  }

  private async buildAuthResult(
    user: IUser,
    userAgent = '',
    assumedOrganizationId: Types.ObjectId | null = null,
  ): Promise<AuthResult> {
    const home = user.organizationId.toString();
    // RE-POINTED, not bypassed: `organizationId` becomes the customer's, so every
    // existing filter in the codebase scopes correctly with no change at all.
    const acting = assumedOrganizationId ? assumedOrganizationId.toString() : home;

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: (user._id as unknown as string).toString(),
      organizationId: acting,
      role: user.role,
      email: user.email,
      perms: await this.resolvePermissions(user),
      sup: user.isSuperAdmin === true,
      ...(acting !== home ? { homeOrganizationId: home } : {}),
    };
    const accessToken = signAccessToken(payload);

    const raw = this.generateRawToken();
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({ userId: user._id, tokenHash, expiresAt, userAgent, assumedOrganizationId });

    return {
      user: {
        id: (user._id as unknown as string).toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: acting,
      },
      accessToken,
      refreshToken: raw,
    };
  }

  /**
   * Switch a super admin into another organisation (or back to their own).
   *
   * Issues a NEW refresh token carrying the assumed org, and revokes the one
   * presented. Re-minting both is what makes the switch survive the 15-minute
   * refresh instead of silently reverting.
   *
   * `isSuperAdmin` is re-read from the DATABASE, never trusted from the token:
   * this is a tenancy boundary, and a demoted admin holding a valid token must
   * not be able to walk into a customer's data.
   */
  async switchOrganization(
    userId: string,
    targetOrganizationId: string | null,
    rawRefreshToken: string,
    userAgent = '',
  ): Promise<AuthResult> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw Object.assign(new Error('User not found or suspended'), { statusCode: 401, code: 'UNAUTHORIZED' });
    }
    if (user.isSuperAdmin !== true) {
      throw Object.assign(new Error('Only a platform administrator can switch organisation'), {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    let assumed: Types.ObjectId | null = null;
    if (targetOrganizationId && targetOrganizationId !== user.organizationId.toString()) {
      if (!Types.ObjectId.isValid(targetOrganizationId)) {
        throw Object.assign(new Error('Organisation not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }
      const org = await Organization.findOne({ _id: targetOrganizationId, deletedAt: null }).select('_id name').lean();
      if (!org) {
        throw Object.assign(new Error('Organisation not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }
      assumed = org._id as Types.ObjectId;
    }

    // Revoke the presented token so a switched session cannot be resumed from an
    // older one still pointing at the previous organisation.
    if (rawRefreshToken) {
      await RefreshToken.updateOne(
        { tokenHash: this.hashToken(rawRefreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      ).catch(() => void 0);
    }

    const result = await this.buildAuthResult(user, userAgent, assumed);

    AuditLog.create({
      organizationId: assumed ?? user.organizationId,
      userId: user._id,
      userEmail: user.email,
      action: 'update',
      resourceType: 'organization',
      resourceId: String(assumed ?? user.organizationId),
      resourceName: assumed ? 'switched into' : 'switched back to own organisation',
      changes: null,
    }).catch(() => void 0);

    return result;
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const existingUser = await User.findOne({ email: input.email.toLowerCase() });
    if (existingUser) {
      throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
    }

    let slug = slugify(input.orgName);
    const existingOrg = await Organization.findOne({ slug });
    if (existingOrg) {
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const org = await Organization.create({
      name: input.orgName,
      slug,
      contactEmail: input.email.toLowerCase(),
      country: input.country,
      timezone: 'UTC',
    });

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    const user = await User.create({
      organizationId: org._id,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'admin',
      roleId: await resolveRoleId('admin', org._id as Types.ObjectId),
      isActive: true,
    });

    return this.buildAuthResult(user);
  }

  /**
   * Mobile signup — creates a FIELD user in the org configured by MOBILE_ORG_ID.
   * The mobile apps no longer share a static API key; each user gets their own JWT
   * (which carries the real org + user id, so devices/records land in the right org
   * and audit correctly). Role is 'operator'. We validate that MOBILE_ORG_ID points
   * to a REAL organization BEFORE creating the user, so a mis-set env can't orphan
   * accounts (the exact failure mode that produced the orphaned devices earlier).
   */
  async mobileSignup(input: MobileSignupInput): Promise<AuthResult> {
    const orgId = process.env.MOBILE_ORG_ID;
    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      throw Object.assign(new Error('Mobile signup is not configured (MOBILE_ORG_ID missing or invalid)'), {
        statusCode: 500,
        code: 'MOBILE_ORG_NOT_CONFIGURED',
      });
    }
    const org = await Organization.findById(orgId);
    if (!org) {
      throw Object.assign(
        new Error('Mobile signup is misconfigured: MOBILE_ORG_ID does not reference an existing organization'),
        { statusCode: 500, code: 'MOBILE_ORG_NOT_FOUND' },
      );
    }

    const email = input.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await User.create({
      organizationId: org._id,
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'operator',
      roleId: await resolveRoleId('operator', org._id as Types.ObjectId),
      mobileAppType: input.appType === 'MET-LINK' || input.appType === 'NEP-LINK' ? input.appType : null,
      isActive: true,
    });

    return this.buildAuthResult(user, input.userAgent);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }
    if (!user.isActive) {
      throw Object.assign(new Error('Account suspended'), { statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    AuditLog.create({
      organizationId: user.organizationId,
      userId: user._id,
      userEmail: user.email,
      action: 'login',
      resourceType: 'user',
      resourceId: (user._id as unknown as string).toString(),
      resourceName: user.email,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    }).catch(() => void 0);

    return this.buildAuthResult(user, input.userAgent);
  }

  async refreshAccessToken(rawRefreshToken: string): Promise<{ accessToken: string }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const record = await RefreshToken.findOne({ tokenHash });

    if (!record) {
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    }
    if (record.revokedAt) {
      throw Object.assign(new Error('Refresh token revoked'), { statusCode: 401, code: 'TOKEN_REVOKED' });
    }
    if (record.expiresAt < new Date()) {
      throw Object.assign(new Error('Refresh token expired'), { statusCode: 401, code: 'TOKEN_EXPIRED' });
    }

    const user = await User.findById(record.userId);
    if (!user || !user.isActive) {
      throw Object.assign(new Error('User not found or suspended'), { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    }

    const home = user.organizationId.toString();
    // Honour the organisation this session switched into. Reading
    // `user.organizationId` here is what used to teleport a super admin back to
    // their own org at the first refresh, mid-session and with no warning.
    //
    // Guarded by a LIVE super-admin check: if the switch happened and the user
    // was demoted afterwards, the assumption is dropped rather than carried, so
    // a revoked platform admin cannot keep browsing a customer's data for the
    // remaining lifetime of the refresh token.
    const stillSuper = user.isSuperAdmin === true;
    const acting = stillSuper && record.assumedOrganizationId ? record.assumedOrganizationId.toString() : home;

    if (record.assumedOrganizationId && !stillSuper) {
      await RefreshToken.updateOne({ _id: record._id }, { $set: { assumedOrganizationId: null } }).catch(() => void 0);
    }

    const accessToken = signAccessToken({
      userId: (user._id as unknown as string).toString(),
      organizationId: acting,
      role: user.role,
      // `email` was previously dropped here — every AuditLog written after a
      // refresh recorded an empty actor email as a result.
      email: user.email,
      // Re-resolved rather than copied, so a permission change takes effect at
      // the next refresh (≤15 minutes) without forcing a re-login.
      perms: await this.resolvePermissions(user),
      sup: stillSuper,
      ...(acting !== home ? { homeOrganizationId: home } : {}),
    });

    return { accessToken };
  }

  /**
   * Mint a short-lived (~60s) WebSocket auth ticket for the socket.io handshake.
   * The BFF hands this to the browser so the long-lived access token never leaves
   * the server. Claim shape mirrors `buildAuthResult`'s access-token payload.
   */
  mintWsTicket(user: JWTPayload): { ticket: string; expiresInSec: number } {
    const ticket = signWsTicket({
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    });
    return { ticket, expiresInSec: 60 };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await RefreshToken.findOneAndUpdate({ tokenHash }, { revokedAt: new Date() });
  }

  /**
   * Step 1 — email a 6-digit reset code. Silent for unknown emails
   * (anti-enumeration). In development the code is also returned as `devCode` so
   * the flow can be tested without reading the inbox.
   */
  async forgotPassword(email: string, ipAddress?: string): Promise<{ devCode?: string }> {
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) return {};

    // Only one active reset per user — a new request supersedes any prior code/token.
    await PasswordResetToken.deleteMany({ userId: user._id });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MINUTES * 60 * 1000);

    await PasswordResetToken.create({
      userId: user._id,
      email: user.email,
      codeHash: this.hashToken(code),
      attempts: 0,
      expiresAt,
      ipAddress: ipAddress ?? null,
    });

    try {
      await sendPasswordResetCodeEmail(user.email, user.firstName, code, RESET_CODE_EXPIRY_MINUTES);
    } catch (err) {
      // A mail-delivery failure must never break the endpoint or reveal that the
      // address exists — log it and still return the normal (204 / dev devCode)
      // response so the API contract and anti-enumeration guarantee hold.
      console.error('[mailer] Failed to send reset code email:', err);
    }

    if (process.env.NODE_ENV === 'development') {
      return { devCode: code };
    }
    return {};
  }

  /**
   * Step 2 — verify the 6-digit code and, on success, issue a single-use reset
   * token the client passes to `resetPassword`. Wrong codes are rate-limited by an
   * attempt counter; the code is consumed on success so it can't be reused.
   */
  async verifyResetCode(email: string, code: string, ipAddress?: string): Promise<{ resetToken: string }> {
    const invalid = () =>
      Object.assign(new Error('Invalid or expired code'), { statusCode: 400, code: 'INVALID_RESET_CODE' });

    const record = await PasswordResetToken.findOne({
      email: email.toLowerCase(),
      codeHash: { $ne: null },
      verifiedAt: null,
    }).sort({ createdAt: -1 });

    if (!record || record.expiresAt < new Date()) throw invalid();

    if (record.codeHash !== this.hashToken(code)) {
      record.attempts += 1;
      if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
        await PasswordResetToken.deleteOne({ _id: record._id });
        throw Object.assign(new Error('Too many attempts — request a new code'), {
          statusCode: 400,
          code: 'TOO_MANY_ATTEMPTS',
        });
      }
      await record.save();
      throw invalid();
    }

    // Correct code → exchange it for a single-use reset token (fresh 15-min window).
    const resetToken = this.generateRawToken();
    record.resetTokenHash = this.hashToken(resetToken);
    record.codeHash = null;
    record.verifiedAt = new Date();
    record.attempts = 0;
    record.expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
    if (ipAddress) record.ipAddress = ipAddress;
    await record.save();

    return { resetToken };
  }

  /**
   * Step 3 — set the new password using the reset token from `verifyResetCode`.
   * Revokes all of the account's refresh tokens.
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    const resetTokenHash = this.hashToken(resetToken);
    const record = await PasswordResetToken.findOne({ resetTokenHash });

    if (!record || !record.verifiedAt) {
      throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400, code: 'INVALID_RESET_TOKEN' });
    }
    if (record.usedAt) {
      throw Object.assign(new Error('Reset token already used'), { statusCode: 400, code: 'TOKEN_ALREADY_USED' });
    }
    if (record.expiresAt < new Date()) {
      throw Object.assign(new Error('Reset token expired'), { statusCode: 400, code: 'TOKEN_EXPIRED' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await User.findByIdAndUpdate(record.userId, { passwordHash });

    record.usedAt = new Date();
    await record.save();

    await RefreshToken.updateMany(
      { userId: record.userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }
}
