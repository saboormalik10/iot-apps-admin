import { describe, it, expect } from 'vitest';
import { loginSchema, resetPasswordSchema, profileSchema } from '@/lib/api/schemas';

describe('Zod validation guards (plan §10.6)', () => {
  it('login rejects an invalid email', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('auth.errors.emailInvalid');
  });

  it('reset requires ≥8 chars and matching confirmation', () => {
    expect(resetPasswordSchema.safeParse({ token: 't', newPassword: 'short', confirmPassword: 'short' }).success).toBe(
      false,
    );
    expect(
      resetPasswordSchema.safeParse({ token: 't', newPassword: 'longenough', confirmPassword: 'different' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 't', newPassword: 'longenough', confirmPassword: 'longenough' }).success,
    ).toBe(true);
  });

  it('profile: changing password requires currentPassword', () => {
    const r = profileSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      newPassword: 'longenough',
      confirmPassword: 'longenough',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'auth.errors.currentPasswordRequired')).toBe(true);
    }
  });

  it('profile: name-only edit is valid', () => {
    expect(profileSchema.safeParse({ firstName: 'A', lastName: 'B' }).success).toBe(true);
  });
});
