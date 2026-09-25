import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupForm } from '@/features/auth/signup-form';
import { getAuthOptions } from '@/lib/bff/auth-options';

export const dynamic = 'force-dynamic';

/** Only when the site turned sign-up on (STANDALONE_SELF_SIGNUP); otherwise not here at all. */
export default async function SignupPage() {
  if (!(await getAuthOptions()).selfSignup) notFound();
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('signupTitle')}</CardTitle>
        <CardDescription>{t('signupSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
