import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/session';
import { AdminTabs } from '@/features/admin/admin-tabs';

/**
 * Admin controls — the platform administrator's own screen.
 *
 * Guarded on the flag rather than a capability: being a platform administrator
 * is not a role, so no capability can express it. Everything inside also
 * enforces its own access server-side; this is the outer gate, not the only one.
 */
export default async function AdminPage() {
  const session = await getSession();
  if (session.user?.isSuperAdmin !== true) redirect('/');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin controls</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide tools — every customer, their stations, and the file formats being ingested.
        </p>
      </div>
      <Suspense>
        <AdminTabs />
      </Suspense>
    </div>
  );
}
