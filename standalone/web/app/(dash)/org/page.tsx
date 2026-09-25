import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { OrgTabs } from '@/features/org/org-tabs';

export default async function OrgPage() {
  const session = await getSession();
  // Server-side guard (nav hides it, backend re-checks — this stops direct nav).
  if (!can(session.user?.role, 'manageOrg')) redirect('/');

  const t = await getTranslations('org');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
      </div>
      <Suspense>
        <OrgTabs />
      </Suspense>
    </div>
  );
}
