import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { RolesPage } from '@/features/roles/roles-page';

/**
 * Server-side guard, matching /org and /users.
 *
 * The nav already hides this from non-admins, but the nav is not a boundary —
 * a typed URL reached it. The backend does refuse (`role:read`), so nothing
 * leaked; a viewer simply landed on an error state for a page they were never
 * meant to see. Redirecting is both the honest answer and the consistent one.
 */
export default async function Page() {
  const session = await getSession();
  if (!can(session.user?.role, 'manageOrg')) redirect('/');
  return <RolesPage />;
}
