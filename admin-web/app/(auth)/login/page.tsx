import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/login-form';
import { getSession, isSessionLive } from '@/lib/session';

export default async function LoginPage() {
  // Skip the login page only for a LIVE session — checking liveness here (not just
  // cookie presence in the middleware) is what prevents a stale cookie from
  // ping-ponging /login ⇄ /. A present-but-stale cookie simply renders the form.
  const session = await getSession();
  if (isSessionLive(session) && session.user) redirect('/');

  const t = await getTranslations('auth');
  return (
    <Card>
      <CardHeader>
        {/* h2: the (auth) layout owns the h1 ("Observator Admin"). */}
        <CardTitle as="h2">{t('loginTitle')}</CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
