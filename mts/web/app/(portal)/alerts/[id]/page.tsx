import { EventPage } from '@/features/alerts/event-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventPage id={id} />;
}
