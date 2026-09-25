import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * "Forgot your password?" on a site PC with no email: there is no code to send,
 * so the answer is an administrator (Users → Reset password), or — when no
 * administrator can sign in — the reset-password command at the station PC.
 */
export async function AskAdminCard() {
  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('askAdminTitle')}</CardTitle>
        <CardDescription>{t('askAdminBody')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('askAdminLocal')}</p>
        <Link href="/login" className="block text-center text-sm text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </CardContent>
    </Card>
  );
}
