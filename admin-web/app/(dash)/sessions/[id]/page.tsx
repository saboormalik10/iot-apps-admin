import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { SessionDetail } from '@/features/sessions/session-detail';

/** NEP session detail route (plan §Month 10). Gated by the `sessions` feature flag. */
export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled('sessions')) notFound();
  const { id } = await params;
  return <SessionDetail id={id} />;
}
