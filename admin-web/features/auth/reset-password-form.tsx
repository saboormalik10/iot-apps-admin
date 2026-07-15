'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { otpResetPasswordSchema } from '@/lib/api/schemas';
import { authApi } from './auth-client';
import { ApiError } from '@/lib/api/errors';

/**
 * OTP password reset (Month-11 flow) — the user enters the 6-digit code emailed by
 * `forgot-password`, plus a new password. On submit we verify the code (→ a
 * single-use reset token) and then set the password, in two API calls. The reset
 * token lives only in this function's scope, never in the URL or storage.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const t = useTranslations('auth');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirmPassword?: string }>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpResetPasswordSchema.safeParse({ code, newPassword: password, confirmPassword });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const p = issue.path[0];
        if (p === 'code') fieldErrors.code = issue.message;
        if (p === 'newPassword') fieldErrors.password = issue.message;
        if (p === 'confirmPassword') fieldErrors.confirmPassword = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { resetToken } = await authApi.verifyResetCode(email, code);
      await authApi.resetPassword(resetToken, password);
      setDone(true);
    } catch (err) {
      // 400 → wrong / expired code, or too many attempts.
      if (err instanceof ApiError && err.status === 400) {
        setErrors({ code: 'auth.errors.codeInvalid' });
      } else {
        setErrors({ code: 'errors.generic' });
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{t('resetDone')}</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="code" label={t('code')} errorKey={errors.code}>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={Boolean(errors.code)}
          disabled={loading}
          className="text-center text-lg tracking-[0.5em]"
        />
      </FormField>
      <FormField id="password" label={t('newPassword')} errorKey={errors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          disabled={loading}
        />
      </FormField>
      <FormField id="confirmPassword" label={t('confirmPassword')} errorKey={errors.confirmPassword}>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={Boolean(errors.confirmPassword)}
          disabled={loading}
        />
      </FormField>
      <Button type="submit" className="w-full" disabled={loading}>
        {t('resetSubmit')}
      </Button>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          {t('resendCode')}
        </Link>
      </div>
    </form>
  );
}
