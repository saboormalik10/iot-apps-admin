import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { FleetPage } from '@/features/fleet/fleet-page';

/** Fleet rollups route (plan §Month 10). Gated by the `analytics` feature flag. */
export default function Page() {
  if (!isFeatureEnabled('analytics')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fleet</h1>
      <FleetPage />
    </div>
  );
}
