import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { isEmailConfigured, sendPasswordResetCodeEmail } from '../utils/mailer';
import { User, IUser } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { AuditLog } from '../models/AuditLog';
import { signAccessToken, signWsTicket, JWTPayload } from '../utils/jwt';
import { Role } from '../models/Role';
import { SEEDED_ROLES, sanitizePermissions } from '../common/permissions';
import { Organization } from '../models/Organization';
import { resolveRoleId } from '../common/resolve-role';

import { BCRYPT_COST } from '../common/bcrypt';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
// Password-reset OTP: a 6-digit code, then a single-use reset token after verify.
const RESET_CODE_EXPIRY_MINUTES = 15;
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Compared against when no account matches, so an unknown email takes as long as
 * a wrong password — otherwise the response time says which emails exist.
 */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

/** People may create their own account (pending an admin's approval). Off by default. */
export function selfSignupEnabled(): boolean {
  return process.env.STANDALONE_SELF_SIGNUP === 'true';
}

export interface SignupInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
    /** An administrator set this password: choose your own before anything else. */
    mustChangePassword: boolean;
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
        mustChangePassword: user.mustChangePassword === true,
      },
      accessToken,
      refreshToken: raw,
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await User.findOne({ email: input.email.toLowerCase(), deletedAt: null });
    // The password is checked BEFORE the account's state, and against a dummy hash
    // when there is no account: an account's status is told only to someone who
    // knows its password, and an unknown email costs the same time as a wrong one.
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }
    if (!user.isActive) {
      if (user.pendingApproval) {
        throw Object.assign(new Error('Your account is waiting for an administrator to approve it'), {
          statusCode: 403,
          code: 'ACCOUNT_PENDING',
        });
      }
      throw Object.assign(new Error('Account suspended'), { statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
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

  /**
   * Create your own account — only when STANDALONE_SELF_SIGNUP=true. It starts
   * INACTIVE, as a Viewer, pending an administrator's approval on the Users screen.
   *
   * The answer is the same whether or not the email is already taken, so the form
   * cannot be used to learn who has an account.
   */
  async signup(input: SignupInput, ipAddress?: string): Promise<void> {
    if (!selfSignupEnabled()) {
      throw Object.assign(new Error('Not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    const email = input.email.toLowerCase().trim();
    // One site, one organisation: first-run created it.
    const org = await Organization.findOne({ deletedAt: null }).sort({ createdAt: 1 }).select('_id').lean();
    if (!org) {
      throw Object.assign(new Error('The site is not set up yet'), { statusCode: 503, code: 'NOT_READY' });
    }
    // Hash first, whatever happens next, so a taken email answers as slowly as a free one.
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    if (await User.exists({ email })) return;

    try {
      const user = await User.create({
        organizationId: org._id,
        email,
        passwordHash,
        firstName: input.firstName?.trim() || email.split('@')[0],
        lastName: input.lastName?.trim() || '',
        role: 'viewer',
        roleId: await resolveRoleId('viewer', org._id as Types.ObjectId),
        isActive: false,
        pendingApproval: true,
      });
      AuditLog.create({
        organizationId: org._id,
        userId: user._id,
        userEmail: user.email,
        action: 'create',
        resourceType: 'user',
        resourceId: String(user._id),
        resourceName: user.email,
        ipAddress: ipAddress ?? null,
        changes: { selfSignup: true, pendingApproval: true },
      }).catch(() => void 0);
    } catch (err) {
      // Two sign-ups for one email at the same moment: the unique index wins; same answer.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
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

    // Skipped when no email server is configured, which is the standalone default.
    // The response is unchanged either way, so whether an account exists stays
    // unrevealed; an administrator resets the password from the Users screen.
    if (isEmailConfigured()) {
      try {
        await sendPasswordResetCodeEmail(user.email, user.firstName, code, RESET_CODE_EXPIRY_MINUTES);
      } catch (err) {
        // A mail-delivery failure must never break the endpoint or reveal that the
        // address exists — log it and still return the normal (204 / dev devCode)
        // response so the API contract and anti-enumeration guarantee hold.
        console.error('[mailer] Failed to send reset code email:', err);
      }
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
