import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { DeviceDetail } from '@/features/devices/device-detail';

/** Device detail route (plan §Month 8). Gated by the `devices` feature flag. */
export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled('devices')) notFound();
  const { id } = await params;
  return <DeviceDetail id={id} />;
}
