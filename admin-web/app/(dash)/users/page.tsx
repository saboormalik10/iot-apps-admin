import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { UsersTable } from '@/features/org/users-table';

export default async function UsersPage() {
  const session = await getSession();
  // Server-side guard (nav hides it, backend re-checks — this stops direct nav).
  if (!can(session.user?.role, 'manageOrg')) redirect('/');

  const t = await getTranslations('users');
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
      </div>
      {/* Everyone who can sign in to the panel — admins, operators, viewers.
          The MET / NEP tabs that used to sit above this listed MOBILE-APP users,
          and the apps were switched off in M15: zero users in this organisation
          carry a `mobileAppType`, so both tabs could only ever be empty.
          Unfiltered by role on purpose — filtering to `admin` would hide the
          operator and viewer created through the Roles screen, leaving them with
          nowhere to be managed. */}
      <Suspense>
        <UsersTable />
      </Suspense>
    </div>
  );
}
