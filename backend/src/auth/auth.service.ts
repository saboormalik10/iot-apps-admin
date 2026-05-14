import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sendPasswordResetEmail } from '../utils/mailer';
import { Organization } from '../models/Organization';
import { User, IUser } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { AuditLog } from '../models/AuditLog';
import { signAccessToken, JWTPayload } from '../utils/jwt';
import { slugify } from '../utils/slug';

const BCRYPT_COST = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const RESET_TOKEN_EXPIRY_HOURS = 1;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

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

async function buildAuthResult(user: IUser, userAgent = ''): Promise<AuthResult> {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: (user._id as unknown as string).toString(),
    organizationId: user.organizationId.toString(),
    role: user.role,
    email: user.email,
  };
  const accessToken = signAccessToken(payload);

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({ userId: user._id, tokenHash, expiresAt, userAgent });

  return {
    user: {
      id: (user._id as unknown as string).toString(),
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

export async function register(input: RegisterInput): Promise<AuthResult> {
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
    isActive: true,
  });

  return buildAuthResult(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
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

  // Write audit log (fire-and-forget — don't block login on audit failure)
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

  return buildAuthResult(user, input.userAgent);
}

export async function refreshAccessToken(rawRefreshToken: string): Promise<{ accessToken: string }> {
  const tokenHash = hashToken(rawRefreshToken);
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

  const accessToken = signAccessToken({
    userId: (user._id as unknown as string).toString(),
    organizationId: user.organizationId.toString(),
    role: user.role,
  });

  return { accessToken };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await RefreshToken.findOneAndUpdate({ tokenHash }, { revokedAt: new Date() });
}

export async function forgotPassword(
  email: string,
  ipAddress?: string,
): Promise<{ devToken?: string }> {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
  // Always return 204 — never reveal if email exists (prevents user enumeration)
  if (!user) return {};

  // Invalidate any existing tokens for this user
  await PasswordResetToken.deleteMany({ userId: user._id });

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await PasswordResetToken.create({
    userId: user._id,
    email: user.email,
    tokenHash,
    expiresAt,
    ipAddress: ipAddress ?? null,
  });

  // TODO Week 4: Send email via Resend API
  // await sendResetEmail(user.email, rawToken);

  const resetUrl = `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${rawToken}`;

  // Send email (fire-and-forget in prod; throw in dev so misconfiguration is visible)
  try {
    await sendPasswordResetEmail(user.email, user.firstName, resetUrl);
  } catch (err) {
    console.error('[mailer] Failed to send reset email:', err);
    if (process.env.NODE_ENV === 'development') throw err;
  }

  // In development, also return token for easy testing without an inbox
  if (process.env.NODE_ENV === 'development') {
    return { devToken: rawToken };
  }
  return {};
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await PasswordResetToken.findOne({ tokenHash });

  if (!record) {
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

  // Revoke all active refresh tokens for security
  await RefreshToken.updateMany(
    { userId: record.userId, revokedAt: null },
    { revokedAt: new Date() },
  );
}
