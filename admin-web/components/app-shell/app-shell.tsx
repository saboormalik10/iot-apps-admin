'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SidebarNav } from './sidebar';
import { UserMenu } from './user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { UnitsToggle } from '@/components/units-toggle';
import { LiveIndicator } from '@/components/live-indicator';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { ScopeBar } from '@/components/scope/scope-bar';
import { BrandMark } from './brand-mark';
import { BrandAccent } from './brand-accent';
import { OrgSwitcher } from '@/features/tenancy/org-switcher';
import { ActingAsBanner } from '@/features/tenancy/acting-as-banner';
import { CommandPalette } from './command-palette';
import { isFeatureEnabled } from '@/lib/config/flags';
import type { SessionUser } from '@/lib/api/types';

/**
 * Responsive shell (plan §13): desktop-first (persistent sidebar), tablet-usable,
 * phone-reduced (sidebar collapses into a drawer). Wide content scrolls inside its
 * own container — the page body never scrolls horizontally.
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const t = useTranslations('app');
  const ts = useTranslations('shell');
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Repaints the primary tokens for this customer; renders nothing without one. */}
      <BrandAccent />
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:block">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BrandMark fallbackName={t('shortName')} initial={t('shortName').slice(0, 1)} />
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={ts('toggleSidebar')}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          {isFeatureEnabled('commandPalette') && <CommandPalette />}
          <div className="flex-1" />
          {/* Renders nothing unless the signed-in user is a platform admin. */}
          <OrgSwitcher />
          <LiveIndicator />
          <UnitsToggle />
          <ThemeToggle />
          <NotificationBell />
          <UserMenu user={user} />
        </header>

        {/* Above the scope bar and on EVERY route, including the admin ones the
            scope bar hides itself on — that is exactly where a forgotten switch
            does the most damage. */}
        <ActingAsBanner />

        {/* Global Scope Bar (plan §3.6) — self-hides on non-data routes. */}
        <ScopeBar />

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile drawer */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="left-0 top-0 h-full max-w-[16rem] translate-x-0 translate-y-0 sm:rounded-none">
          <DialogTitle className="sr-only">{ts('toggleSidebar')}</DialogTitle>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
