'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { acceptInviteSchema, resetPasswordSchema } from '@/lib/api/schemas';
import { authApi } from './auth-client';
import { ApiError } from '@/lib/api/errors';

type Mode = 'reset' | 'invite';

/**
 * Shared "set a password from an email link" form for both reset-password and
 * accept-invite. Reads ?token= from the link (A2). Handles expired / invalid /
 * already-used tokens gracefully (the API 400/401s a dead token → "link expired"
 * state, not a crash). accept-invite auto-logins on success.
 */
export function SetPasswordForm({ mode, token }: { mode: Mode; token: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [dead, setDead] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordField = mode === 'invite' ? 'password' : 'newPassword';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input =
      mode === 'invite'
        ? { token, password, confirmPassword }
        : { token, newPassword: password, confirmPassword };
    const schema = mode === 'invite' ? acceptInviteSchema : resetPasswordSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const p = issue.path[0];
        if (p === passwordField) fieldErrors.password = issue.message;
        if (p === 'confirmPassword') fieldErrors.confirmPassword = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === 'invite') {
        await authApi.acceptInvite(token, password);
        router.replace('/'); // auto-login
        router.refresh();
      } else {
        await authApi.resetPassword(token, password);
        setDone(true);
      }
    } catch (err) {
      // 400/401 → the token is expired / used / invalid.
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setDead(true);
      } else {
        setErrors({ password: 'errors.generic' });
      }
    } finally {
      setLoading(false);
    }
  }

  if (dead) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-base font-semibold">{t('linkExpiredTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('linkExpiredBody')}</p>
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          {t('requestNewLink')}
        </Link>
      </div>
    );
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
        {mode === 'invite' ? t('acceptInviteSubmit') : t('resetSubmit')}
      </Button>
    </form>
  );
}
