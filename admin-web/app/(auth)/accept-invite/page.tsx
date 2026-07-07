import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SetPasswordForm } from '@/features/auth/set-password-form';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations('auth');
  const { token } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('acceptInviteTitle')}</CardTitle>
        <CardDescription>{t('acceptInviteSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <SetPasswordForm mode="invite" token={token} />
        ) : (
          <div className="space-y-4 text-center">
            <h2 className="text-base font-semibold">{t('linkExpiredTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('linkExpiredBody')}</p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              {t('backToLogin')}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
