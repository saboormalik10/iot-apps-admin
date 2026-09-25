import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/config/flags';
import { DevicesList } from '@/features/devices/devices-list';

/** Devices list route (plan §Month 8). Gated by the `devices` feature flag. */
export default function DevicesPage() {
  if (!isFeatureEnabled('devices')) notFound();
  return <DevicesList />;
}
