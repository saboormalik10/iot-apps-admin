import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { UsersTabs } from '@/features/users/users-tabs';

export default async function UsersPage() {
  const session = await getSession();
  // Server-side guard (nav hides it, backend re-checks — this stops direct nav).
  if (!can(session.user?.role, 'manageOrg')) redirect('/');

  const t = await getTranslations('mobileUsers');
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
      </div>
      <Suspense>
        <UsersTabs />
      </Suspense>
    </div>
  );
}
