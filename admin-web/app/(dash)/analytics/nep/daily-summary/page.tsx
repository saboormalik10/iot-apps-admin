import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { NepDailySummaryPage } from '@/features/analytics-nep/daily-summary/nep-daily-summary-page';

/** NEP daily-summary suite route (plan §Month 10, §10.7). Gated by `analytics`. */
export default function Page() {
  if (!isFeatureEnabled('analytics')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">NEP Daily Summary</h1>
      <NepDailySummaryPage />
    </div>
  );
}
