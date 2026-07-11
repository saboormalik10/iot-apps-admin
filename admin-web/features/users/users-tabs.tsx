'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersTable } from '@/features/org/users-table';
import { MobileUsersTable } from './mobile-users-table';

const TABS = ['met', 'nep', 'admins'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Users page — replaces the retired Organization nav entry. Mobile field users
 * are split by app (MET / NEP) with upload activity; "Admins" keeps the classic
 * org-member table (invite, roles, activate/deactivate) narrowed to admins —
 * other roles (viewer, plain operator) are hidden here for now.
 */
export function UsersTabs() {
  const t = useTranslations('mobileUsers');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('tab');
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'met';
  const setTab = (v: string) => router.replace(`${pathname}?tab=${v}`, { scroll: false });

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="met">{t('metTab')}</TabsTrigger>
        <TabsTrigger value="nep">{t('nepTab')}</TabsTrigger>
        <TabsTrigger value="admins">{t('adminsTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="met">
        <MobileUsersTable type="MET-LINK" />
      </TabsContent>
      <TabsContent value="nep">
        <MobileUsersTable type="NEP-LINK" />
      </TabsContent>
      <TabsContent value="admins">
        <UsersTable roles={['admin']} />
      </TabsContent>
    </Tabs>
  );
}
