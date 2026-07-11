import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { RecordDetail } from '@/features/records/record-detail';

/** MET record detail route (plan §Month 9). Gated by the `records` feature flag. */
export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled('records')) notFound();
  const { id } = await params;
  return <RecordDetail id={id} />;
}
