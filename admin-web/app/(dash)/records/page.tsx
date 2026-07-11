import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { RecordsList } from '@/features/records/records-list';

/** MET records list route (plan §Month 9). Gated by the `records` feature flag. */
export default function Page() {
  if (!isFeatureEnabled('records')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">MET Records</h1>
      <RecordsList />
    </div>
  );
}
