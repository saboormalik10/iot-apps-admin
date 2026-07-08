import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { FleetMapPanel } from '@/features/maps/fleet-map-panel';

/** Full-screen fleet map (plan §Month 8). Gated by the `maps` feature flag. */
export default function MapPage() {
  if (!isFeatureEnabled('maps')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fleet map</h1>
      <FleetMapPanel />
    </div>
  );
}
