'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { loginSchema } from '@/lib/api/schemas';
import { authApi } from './auth-client';
import { ApiError } from '@/lib/api/errors';

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'email' | 'password';
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await authApi.login(parsed.data.email, parsed.data.password);
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Respect Retry-After + add jitter; neutral message (no enumeration).
        const base = err.retryAfterSec ?? 30;
        setCooldown(base + Math.floor(Math.random() * 5));
        setFormError(t('tooManyAttempts'));
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError(t('invalidCredentials'));
      } else {
        setFormError(t('invalidCredentials'));
      }
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || cooldown > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="email" label={t('email')} errorKey={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          disabled={disabled}
        />
      </FormField>
      <FormField id="password" label={t('password')} errorKey={errors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          disabled={disabled}
        />
      </FormField>

      {formError ? (
        <p className="text-sm text-status-error" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={disabled}>
        {loading ? t('signingIn') : cooldown > 0 ? `${t('signIn')} (${cooldown}s)` : t('signIn')}
      </Button>

      <div className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          {t('forgotPassword')}
        </Link>
      </div>
    </form>
  );
}
