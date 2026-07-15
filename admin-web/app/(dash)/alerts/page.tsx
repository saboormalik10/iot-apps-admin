import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { AlertsPage } from '@/features/alerts/alerts-page';

/** Alerts route (plan §Month 11). Gated by the `alerts` feature flag. */
export default function Page() {
  if (!isFeatureEnabled('alerts')) notFound();
  return <AlertsPage />;
}
