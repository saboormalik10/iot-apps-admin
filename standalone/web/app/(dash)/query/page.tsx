import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { QueryPage } from '@/features/query/query-page';

/** The query screen — chosen parameters over a chosen period, as a table or a CSV. */
export default async function Query() {
  const session = await getSession();
  if (!can(session.user?.role, 'viewData')) redirect('/');

  const t = await getTranslations('nav');
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('query')}</h1>
        <p className="text-sm text-muted-foreground">
          Choose a period and the readings you want — see them here, or download them as a CSV file.
        </p>
      </div>
      <QueryPage />
    </div>
  );
}
