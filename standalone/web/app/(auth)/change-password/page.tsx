import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { getSession, isSessionLive } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Where a user lands after an administrator set their password (see the dash layout). */
export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!isSessionLive(session) || !session.user) redirect('/login');
  if (!session.user.mustChangePassword) redirect('/');

  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('changeTitle')}</CardTitle>
        <CardDescription>{t('changeSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm email={session.user.email} />
      </CardContent>
    </Card>
  );
}
