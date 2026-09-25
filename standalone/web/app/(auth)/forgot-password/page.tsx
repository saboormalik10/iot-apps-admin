import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';
import { AskAdminCard } from '@/features/auth/ask-admin-card';
import { getAuthOptions } from '@/lib/bff/auth-options';

export const dynamic = 'force-dynamic';

export default async function ForgotPasswordPage() {
  // No email server (the normal case on a site PC): no code can be sent.
  if (!(await getAuthOptions()).emailReset) return <AskAdminCard />;
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forgotTitle')}</CardTitle>
        <CardDescription>{t('forgotSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
