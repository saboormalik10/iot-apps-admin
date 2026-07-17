import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { isFeatureEnabled } from '@/lib/config/flags';
import { ImportWizard } from '@/features/import/import-wizard';

/**
 * CSV import route (plan §Month 12). Admin-only (`importData`), matching the
 * backend's `@Roles('admin')` on the import controller. Server-side guard stops
 * direct navigation; the nav hides it and the backend re-checks.
 */
export default async function ImportPage() {
  if (!isFeatureEnabled('importExport')) notFound();

  const session = await getSession();
  if (!can(session.user?.role, 'importData')) redirect('/');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import data</h1>
        <p className="text-xs text-muted-foreground">
          Backfill historical NEP-Link sessions or MET-Link measures from a CSV. We check the file against the
          expected columns and show you exactly what will import before anything is written.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
