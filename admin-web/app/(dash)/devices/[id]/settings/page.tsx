import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { can } from '@/lib/rbac/capabilities';
import { isFeatureEnabled } from '@/lib/config/flags';
import { DeviceSettingsForm } from '@/features/devices/device-settings-form';

/**
 * Device settings route (plan §Month 8). Gated by the `devices` flag AND the
 * `manageDevices` capability (admin) — its writes reach the live field device.
 */
export default async function DeviceSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled('devices')) notFound();
  const session = await getSession();
  if (!can(session.user?.role, 'manageDevices')) notFound();
  const { id } = await params;
  return <DeviceSettingsForm deviceId={id} />;
}
