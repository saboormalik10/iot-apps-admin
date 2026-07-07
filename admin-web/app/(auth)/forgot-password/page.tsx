import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export default async function ForgotPasswordPage() {
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
