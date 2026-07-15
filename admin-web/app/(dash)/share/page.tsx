import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { SharePage } from '@/features/share/share-page';

/** Share-links management route (plan §Month 11). Gated by the `share` feature flag. */
export default function Page() {
  if (!isFeatureEnabled('share')) notFound();
  return <SharePage />;
}
