'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrgSettingsForm } from './org-settings-form';
import { UsersTable } from './users-table';
import { AuditLog } from '@/features/audit/audit-log';

const TABS = ['settings', 'users', 'audit'] as const;
type TabKey = (typeof TABS)[number];

export function OrgTabs() {
  const t = useTranslations('org');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('tab');
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'settings';
  const setTab = (v: string) => router.replace(`${pathname}?tab=${v}`, { scroll: false });

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="settings">{t('settingsTab')}</TabsTrigger>
        <TabsTrigger value="users">{t('usersTab')}</TabsTrigger>
        <TabsTrigger value="audit">{t('auditTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="settings">
        <OrgSettingsForm />
      </TabsContent>
      <TabsContent value="users">
        <UsersTable />
      </TabsContent>
      <TabsContent value="audit">
        <AuditLog />
      </TabsContent>
    </Tabs>
  );
}
