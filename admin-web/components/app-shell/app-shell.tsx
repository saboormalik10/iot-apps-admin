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
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:block">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
            <span className="text-sm font-bold">O</span>
          </div>
          <span className="text-sm font-semibold">{t('shortName')}</span>
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
          <div className="flex-1" />
          <LiveIndicator />
          <UnitsToggle />
          <ThemeToggle />
          <NotificationBell />
          <UserMenu user={user} />
        </header>

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
