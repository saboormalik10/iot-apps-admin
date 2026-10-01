import { StationPage } from '@/features/station/station-page';
import type { LocationId } from '@/lib/api/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StationPage id={id as LocationId} />;
}
