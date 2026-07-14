import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { MapsTabs } from '@/features/maps/maps-tabs';

/** Fleet map + NEP GPS-density heatmap (plan §Month 8 / §Month 10). Gated by `maps`. */
export default function MapPage() {
  if (!isFeatureEnabled('maps')) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Maps</h1>
      <MapsTabs />
    </div>
  );
}
