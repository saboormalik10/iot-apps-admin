import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { SessionsList } from '@/features/sessions/sessions-list';

/** NEP sessions list route (plan §Month 10). Gated by the `sessions` feature flag. */
export default function Page() {
  if (!isFeatureEnabled('sessions')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">NEP Sessions</h1>
      <SessionsList />
    </div>
  );
}
