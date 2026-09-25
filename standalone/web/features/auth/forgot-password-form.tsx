'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { forgotPasswordSchema } from '@/lib/api/schemas';
import { authApi } from './auth-client';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [errorKey, setErrorKey] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorKey(parsed.error.issues[0]?.message);
      return;
    }
    setErrorKey(undefined);
    setLoading(true);
    try {
      await authApi.forgotPassword(parsed.data.email);
    } catch {
      // Stay neutral even on error — no user enumeration.
    } finally {
      // Always advance to the code-entry screen (revealing nothing about whether
      // the email exists). If it does, a 6-digit code is on its way.
      router.push(`/reset-password?email=${encodeURIComponent(parsed.data.email)}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="email" label={t('email')} errorKey={errorKey}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errorKey)}
          disabled={loading}
        />
      </FormField>
      <Button type="submit" className="w-full" disabled={loading}>
        {t('forgotSubmit')}
      </Button>
      <div className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  );
}
