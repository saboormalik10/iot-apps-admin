import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const t = await getTranslations('auth');
  const { email } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('resetTitle')}</CardTitle>
        <CardDescription>{email ? t('resetSubtitle', { email }) : t('noEmailBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        {email ? (
          <ResetPasswordForm email={email} />
        ) : (
          <div className="space-y-4 text-center">
            <h2 className="text-base font-semibold">{t('noEmailTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('noEmailBody')}</p>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              {t('requestNewLink')}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
