import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Organization } from '../models/Organization';
import { User, IUser, UserRole } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { InviteToken } from '../models/InviteToken';
import { AuditLog } from '../models/AuditLog';
import { sendInviteEmail } from '../utils/mailer';
import { signAccessToken, JWTPayload } from '../utils/jwt';

const BCRYPT_COST = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const INVITE_TOKEN_EXPIRY_DAYS = 7;
const VALID_ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

interface ActorMeta {
  userId: string;
  email: string;
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
  isActive?: boolean;
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
    const users = await User.find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: 1 });
    return users.map(publicUser);
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

    const inviteUrl = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/auth/accept-invite?token=${rawToken}`;

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

    const demotingAdmin = user.role === 'admin' && input.role !== undefined && input.role !== 'admin';
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
    if (input.role !== undefined) {
      if (!VALID_ROLES.includes(input.role)) {
        throw Object.assign(new Error(`role must be one of: ${VALID_ROLES.join(', ')}`), {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
      changes.role = input.role;
      user.role = input.role;
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
