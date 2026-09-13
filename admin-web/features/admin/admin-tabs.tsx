'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformPage } from '@/features/tenancy/platform-page';
import { StreamTypesPage } from '@/features/streams/stream-types-page';

/**
 * Everything that belongs to the platform administrator, in one place.
 *
 * These were scattered through a nav built for customers: "All customers" sat
 * between Audit log and Stream types, and the cross-customer view of stream
 * types looked like the customer's own screen while showing every tenant's
 * stations. Nothing said which screens were administering the PLATFORM and
 * which were administering one customer.
 *
 * The tab lives in the URL so a tab can be linked to and survives a refresh —
 * `/admin?tab=streams` is a real address, which matters when someone is being
 * told where to click.
 */
const TABS = ['customers', 'streams'] as const;
type TabKey = (typeof TABS)[number];

export function AdminTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('tab');
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'customers';

  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
      <TabsList>
        <TabsTrigger value="customers">Customers</TabsTrigger>
        <TabsTrigger value="streams">Stream types</TabsTrigger>
      </TabsList>

      <TabsContent value="customers" className="mt-4">
        <PlatformPage />
      </TabsContent>
      <TabsContent value="streams" className="mt-4">
        <StreamTypesPage />
      </TabsContent>
    </Tabs>
  );
}
