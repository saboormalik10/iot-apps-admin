import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { AuditLog } from '@/features/audit/audit-log';

/**
 * The audit log, on a route of its own.
 *
 * It used to be the third tab of the Organization page. That page was retired
 * from the nav when user management moved to /users and org settings to
 * /settings — but the audit tab moved nowhere, so the only way to reach it was
 * to know the URL `/org?tab=audit` and type it. A record of who did what is not
 * much use if nobody can find it.
 *
 * Guarded server-side to match the API, which requires the `admin` role AND
 * `audit:read`: the log shows every user's activity, including sign-ins.
 */
export default async function AuditPage() {
  const session = await getSession();
  if (!can(session.user?.role, 'manageOrg')) redirect('/');

  const t = await getTranslations('nav');
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('audit')}</h1>
        <p className="text-sm text-muted-foreground">
          Who did what, and when — across stations, people, roles and alert rules.
        </p>
      </div>
      <Suspense>
        <AuditLog />
      </Suspense>
    </div>
  );
}
