'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { http } from '@/lib/api/http';
import { ApiError } from '@/lib/api/errors';
import { authApi } from './auth-client';

/**
 * Choose your own password after an administrator set one. The profile's password
 * change, standing alone, and the only thing such a user can do until it is done.
 *
 * Signs in again with the new password afterwards: changing it ends every session
 * the account had, this one included, and the fresh sign-in is also what clears
 * the "must change" mark from the session.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: typeof errors = {};
    if (!current) fe.current = 'auth.errors.passwordRequired';
    if (next.length < 8) fe.next = 'auth.errors.passwordMin';
    if (next !== confirm) fe.confirm = 'auth.errors.passwordsMismatch';
    setErrors(fe);
    setFormError(null);
    if (Object.keys(fe).length) return;

    setLoading(true);
    try {
      await http.patch('/users/me', { currentPassword: current, newPassword: next });
      await authApi.login(email, next);
      router.replace('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CURRENT_PASSWORD_INCORRECT') {
        setErrors({ current: 'auth.currentPasswordWrong' });
      } else if (err instanceof ApiError && err.code === 'SAME_PASSWORD') {
        setErrors({ next: 'auth.samePassword' });
      } else {
        setFormError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="current-password" label={t('currentPassword')} errorKey={errors.current}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={Boolean(errors.current)}
          disabled={loading}
        />
      </FormField>
      <FormField id="new-password" label={t('newPassword')} errorKey={errors.next}>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={Boolean(errors.next)}
          disabled={loading}
        />
      </FormField>
      <FormField id="confirm-password" label={t('confirmPassword')} errorKey={errors.confirm}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          disabled={loading}
        />
      </FormField>
      {formError ? (
        <p className="text-sm text-status-error-strong" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {t('changeSubmit')}
      </Button>
    </form>
  );
}
