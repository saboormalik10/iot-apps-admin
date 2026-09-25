'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { ApiError } from '@/lib/api/errors';
import { authApi } from './auth-client';

/**
 * Ask for an account (only offered when the site turned sign-up on). It waits,
 * inactive, until an administrator approves it on the Users screen — so the
 * answer is always "sent; ask an administrator", never "signed in".
 */
export function SignupForm() {
  const t = useTranslations('auth');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = 'auth.errors.emailInvalid';
    if (password.length < 8) fe.password = 'auth.errors.passwordMin';
    if (password !== confirm) fe.confirm = 'auth.errors.passwordsMismatch';
    setErrors(fe);
    setFormError(null);
    if (Object.keys(fe).length) return;

    setLoading(true);
    try {
      await authApi.signup({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() });
      setSent(true);
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 429 ? t('tooManyAttempts') : err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <h3 className="text-base font-semibold">{t('signupDoneTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('signupDoneBody')}</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="signup-first" label={t('firstNameOptional')}>
          <Input id="signup-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
        </FormField>
        <FormField id="signup-last" label={t('lastNameOptional')}>
          <Input id="signup-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
        </FormField>
      </div>
      <FormField id="signup-email" label={t('email')} errorKey={errors.email}>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          disabled={loading}
        />
      </FormField>
      <FormField id="signup-password" label={t('password')} errorKey={errors.password}>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          disabled={loading}
        />
      </FormField>
      <FormField id="signup-confirm" label={t('confirmPassword')} errorKey={errors.confirm}>
        <Input
          id="signup-confirm"
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
        {t('signupSubmit')}
      </Button>
      <div className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t('haveAccount')}
        </Link>
      </div>
    </form>
  );
}
