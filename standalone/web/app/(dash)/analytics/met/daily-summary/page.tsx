import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { DailySummaryPage } from '@/features/analytics/daily-summary/daily-summary-page';

/** MET daily-summary suite route (plan §Month 9, §10.7). Gated by `analytics`. */
export default function Page() {
  if (!isFeatureEnabled('analytics')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">MET Daily Summary</h1>
      <DailySummaryPage />
    </div>
  );
}
