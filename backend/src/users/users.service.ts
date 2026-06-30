import bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AuditLog } from '../models/AuditLog';

const BCRYPT_COST = 12;

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface ActorMeta {
  userId: string;
  email: string;
}

function publicUser(user: {
  _id: unknown;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: Types.ObjectId;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: (user._id as Types.ObjectId).toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationId: user.organizationId.toString(),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    return publicUser(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput, actor: ActorMeta) {
    const user = await User.findById(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    const changes: Record<string, unknown> = {};

    if (typeof input.firstName === 'string' && input.firstName.trim()) {
      user.firstName = input.firstName.trim();
      changes.firstName = user.firstName;
    }
    if (typeof input.lastName === 'string' && input.lastName.trim()) {
      user.lastName = input.lastName.trim();
      changes.lastName = user.lastName;
    }

    // Password change is opt-in: requires both currentPassword and newPassword.
    if (input.newPassword !== undefined || input.currentPassword !== undefined) {
      if (!input.currentPassword || !input.newPassword) {
        throw Object.assign(new Error('currentPassword and newPassword are both required to change password'), {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
      if (input.newPassword.length < 8) {
        throw Object.assign(new Error('Password must be at least 8 characters'), {
          statusCode: 400,
          code: 'WEAK_PASSWORD',
        });
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw Object.assign(new Error('Current password is incorrect'), {
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
        });
      }
      user.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
      changes.password = 'changed';

      // Invalidate all other active sessions after a password change.
      await RefreshToken.updateMany(
        { userId: user._id, revokedAt: null },
        { revokedAt: new Date() },
      );
    }

    await user.save();

    AuditLog.create({
      organizationId: user.organizationId,
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'update',
      resourceType: 'user',
      resourceId: (user._id as Types.ObjectId).toString(),
      resourceName: user.email,
      changes: Object.keys(changes).length ? changes : null,
    }).catch(() => void 0);

    return publicUser(user);
  }
}
