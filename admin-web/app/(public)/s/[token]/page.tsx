import type { Metadata } from 'next';
import { PublicSnapshotView } from '@/features/share/public-snapshot-view';

/**
 * Unauthenticated read-only shared view (plan §Month 11 / §17 Q4). `noindex` +
 * link-only + static snapshot (no realtime). Middleware allows `/s/*` without a
 * session; the data comes from the no-auth `/api/public/:token` BFF route.
 */
export const metadata: Metadata = {
  title: 'Shared view · ObservatorNepLink',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicSnapshotView token={token} />;
}
