import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/**
 * `/platform` moved into Admin controls.
 *
 * Redirected rather than deleted: the URL is in bookmarks, in the command
 * palette's history, and in anything already written down. A 404 would look like
 * the feature had been removed rather than moved.
 */
export default async function PlatformPage() {
  const session = await getSession();
  if (session.user?.isSuperAdmin !== true) redirect('/');
  redirect('/admin?tab=customers');
}
