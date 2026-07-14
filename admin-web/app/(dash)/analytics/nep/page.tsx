import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { NepAnalyticsPage } from '@/features/analytics-nep/nep-analytics-page';

/** NEP Analytics Suite route (plan §Month 10). Gated by the `analytics` flag. */
export default function Page() {
  if (!isFeatureEnabled('analytics')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">NEP Analytics</h1>
      <NepAnalyticsPage />
    </div>
  );
}
