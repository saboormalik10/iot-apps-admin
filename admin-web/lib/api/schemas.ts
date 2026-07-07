import { z } from 'zod';

/**
 * Zod is the PRIMARY validation guard (plan §10.6 — auth DTOs have no server-side
 * class-validator). The server `message[]` is only a form-level fallback. Mirror
 * the backend's real rules: email format + password ≥ 8.
 */
const email = z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid');
const password = z.string().min(8, 'auth.errors.passwordMin');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: password,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'auth.errors.passwordsMismatch',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    password,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'auth.errors.passwordsMismatch',
    path: ['confirmPassword'],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// ── Org / people ──────────────────────────────────────────────────────────────
export const roleSchema = z.enum(['admin', 'operator', 'viewer']);

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  country: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteUserSchema = z.object({
  email,
  role: roleSchema.default('viewer'),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ── Profile ─────────────────────────────────────────────────────────────────
export const profileSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const changing = Boolean(v.newPassword && v.newPassword.length > 0);
    if (!changing) return;
    if ((v.newPassword ?? '').length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.errors.passwordMin', path: ['newPassword'] });
    }
    if (!v.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.errors.currentPasswordRequired',
        path: ['currentPassword'],
      });
    }
    if (v.newPassword !== v.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.errors.passwordsMismatch', path: ['confirmPassword'] });
    }
  });
export type ProfileInput = z.infer<typeof profileSchema>;
