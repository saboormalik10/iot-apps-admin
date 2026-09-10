import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { PlatformPage } from '@/features/tenancy/platform-page';

/**
 * Platform administrators only — a customer must not even learn that other
 * customers exist.
 *
 * The page component renders "Not available" for everyone else and every
 * endpoint behind it 403s, so this closes a gap in consistency rather than a
 * leak: /org and /users redirect on a direct URL, and this did not.
 */
export default async function Page() {
  const session = await getSession();
  if (session.user?.isSuperAdmin !== true) redirect('/');
  return <PlatformPage />;
}
