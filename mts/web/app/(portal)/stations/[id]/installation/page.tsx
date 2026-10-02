import { InstallationPage } from '@/features/station/installation-page';
import type { LocationId } from '@/lib/api/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstallationPage id={id as LocationId} />;
}
