import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { NotificationsPage } from '@/features/notifications/notifications-page';

/** Notifications feed route (plan §Month 11). Gated by the `notifications` flag. */
export default function Page() {
  if (!isFeatureEnabled('notifications')) notFound();
  return <NotificationsPage />;
}
