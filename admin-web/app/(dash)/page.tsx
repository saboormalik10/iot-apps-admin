import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UserPlus, Cpu } from 'lucide-react';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Month 7 dash index = shell + first-run/welcome placeholder (plan §13). The live
 * dashboard home (KPIs, tiles, wind rose) lands Month 8. Empty-org onboarding
 * teaches the next actions.
 */
export default async function DashHomePage() {
  const t = await getTranslations('onboarding');
  const session = await getSession();
  const isAdmin = can(session.user?.role, 'manageOrg');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('welcomeTitle')}</h1>
        <p className="mt-1 text-muted-foreground">{t('welcomeBody')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isAdmin ? (
          <Card>
            <CardHeader>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{t('inviteStepTitle')}</CardTitle>
              <CardDescription>{t('inviteStepBody')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm">
                <Link href="/org?tab=users">{t('inviteStepCta')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">{t('deviceStepTitle')}</CardTitle>
            <CardDescription>{t('deviceStepBody')}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">{t('dashboardComingSoon')}</p>
    </div>
  );
}
