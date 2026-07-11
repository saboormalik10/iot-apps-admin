import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { AnalyticsPage } from '@/features/analytics/analytics-page';

/** MET Analytics Suite route (plan §Month 9). Gated by the `analytics` flag. */
export default function Page() {
  if (!isFeatureEnabled('analytics')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">MET Analytics</h1>
      <AnalyticsPage />
    </div>
  );
}
