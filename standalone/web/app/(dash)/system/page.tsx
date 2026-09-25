import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { SystemPage } from '@/features/system/system-page';

/**
 * The station PC's health.
 *
 * For the people who keep it running — it names the data folder, the backups and
 * the free disk — so a read-only viewer is sent back to the dashboard, as they are
 * from Users and the audit log. The API enforces the same permission.
 */
export default async function Page() {
  const session = await getSession();
  if (!session.user?.permissions?.includes('system:read')) redirect('/');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="text-sm text-muted-foreground">The sensor connection, backups, disk space and this PC&apos;s clock.</p>
      </div>
      <SystemPage />
    </div>
  );
}
