'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, CalendarClock, Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';
import { DemoDock } from './demo-dock';
import { InactivityWarning } from './inactivity-warning';
import { PtzWatcher } from './ptz-watcher';
import { NAV_ITEMS } from './nav-config';
import { useDemoClock } from '@/lib/demo-clock';
import { useDataRevision } from '@/lib/use-data';
import type { MaintenanceWindow } from '@/lib/api/types';
import {
  DEMO_USER,
  activeAlertCount,
  leadAlert,
  maintenanceWindows,
  stationCount,
  unacknowledgedCount,
} from '@/lib/api/endpoints';
import { fmtClock, fmtDateTime, sydneyZone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * The masthead, the navigation and the alert ticker.
 *
 * It follows the client's own Figure 6: a navy bar carrying the wordmark and the
 * portal's name, the time in Sydney (AEST / AEDT) on the right with the live status chips beside
 * it, and — when something is wrong — an amber ticker directly underneath holding
 * the operational instruction, because that sentence is the reason anyone opened
 * the portal at all.
 */

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const now = useDemoClock();
  const [menuOpen, setMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  /* Escape closes the mobile menu, like every other overlay in the app. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  /* The chip, the badge and every page's own count come off one revision, so an
     acknowledgement moves all of them on the same frame. */
  useDataRevision();
  const counts = stationCount();
  /* Alert counts depend on the demo clock, and the server's clock is not the
     browser's: a dev server (or a Vercel function) that has been up for twenty
     minutes has already "seen" alerts a freshly opened page has not reached yet,
     and React rightly refuses the mismatch. So they are client-only — zero, no
     chip, on the server's first paint. */
  const live = mounted && now > 0;
  const alerts = live ? activeAlertCount() : 0;
  const unread = live ? unacknowledgedCount() : 0;
  const lead = live ? leadAlert() : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The first tab stop was the logo, so reaching the page meant tabbing
          through the whole masthead and nav on every screen. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <PrototypeBanner />

      <header className="sticky top-0 z-30 bg-header text-header-foreground print:hidden">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-header-foreground hover:bg-white/10 lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <Menu className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <Link href="/" className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-bold tracking-wide sm:text-base">OBSERVATOR</span>
            <span className="hidden truncate text-xs text-header-muted sm:inline">
              Weather Monitoring Portal — Sydney Metro M1
            </span>
          </Link>

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {NAV_ITEMS.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    active ? 'bg-white/15 font-medium text-white' : 'text-header-muted hover:bg-white/10 hover:text-white',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Empty until the first client tick: the server's clock and the
                browser's differ by a few hundred ms, which React calls a mismatch. */}
            <time className="tabular hidden w-[92px] text-xs text-header-muted sm:block">
              {now ? (
                <>
                  {fmtClock(now)} <span className="opacity-90">{sydneyZone(now)}</span>
                </>
              ) : null}
            </time>

            {alerts > 0 ? (
              <Link
                href="/alerts"
                className="inline-flex items-center gap-1.5 rounded-full bg-sev-warning px-2.5 py-1 text-xs font-semibold text-black/80"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-black/60" aria-hidden />
                {alerts} ACTIVE {alerts === 1 ? 'ALERT' : 'ALERTS'}
              </Link>
            ) : null}

            <span className="hidden items-center gap-1.5 rounded-full bg-chip-ok px-2.5 py-1 text-xs font-semibold text-chip-ok-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
              {counts.loggers}/{counts.loggers} ONLINE
            </span>

            {mounted ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-header-foreground hover:bg-white/10"
                aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            ) : (
              <span className="h-8 w-8" />
            )}

            <Link
              href="/alerts"
              className="relative rounded-md p-1.5 hover:bg-white/10"
              aria-label={`${unread} unacknowledged alerts`}
            >
              <AlertTriangle className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-chip-alert px-1 text-[11px] font-bold text-chip-alert-foreground">
                  {unread}
                </span>
              ) : null}
            </Link>

            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold"
              aria-label={`Your profile — ${DEMO_USER.name}`}
            >
              {DEMO_USER.initials}
            </Link>
          </div>
        </div>

        {menuOpen ? (
          <nav aria-label="Primary" className="border-t border-header-border px-3 pb-3 lg:hidden">
            <ul className="grid grid-cols-2 gap-1 pt-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm text-header-muted hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {/* Printing an event is printing a report: no masthead, ticker or notices on paper. */}
      <div className="print:hidden">
        {lead ? <AlertTicker /> : null}
        <MaintenanceStrip now={now} />
      </div>

      <main id="main" className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      <InactivityWarning />
      <PtzWatcher />
      <DemoDock />
    </div>
  );
}

/**
 * §8.1: planned maintenance is notified at least 48 hours ahead. A notice only on
 * the Health screen is a notice most users never see, so it rides under the
 * masthead on every screen for the fortnight before the window — quietly, in the
 * info colour, and dismissible for the session.
 */
function MaintenanceStrip({ now }: { now: number }) {
  const [w, setW] = useState<MaintenanceWindow | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    maintenanceWindows().then((all) => setW(all[0] ?? null));
  }, []);
  if (!w || hidden || !now || w.from - now > 14 * 86_400_000 || w.to < now) return null;
  return (
    <div className="flex items-center gap-2 border-b border-sev-info/30 bg-sev-info-tint px-3 py-1.5 text-xs text-sev-info-strong sm:px-4">
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Planned maintenance</span> {fmtDateTime(w.from)} – {fmtDateTime(w.to)} · readings may pause during the window.
      </p>
      <Link href="/health" className="shrink-0 underline underline-offset-2">
        Details
      </Link>
      <button onClick={() => setHidden(true)} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Hide the maintenance notice">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** The amber instruction bar under the masthead. */
function AlertTicker() {
  const lead = leadAlert();
  const [dismissed, setDismissed] = useState(false);
  if (!lead || dismissed) return null;
  return (
    <div className="flex items-start gap-2 border-b border-sev-warning/40 bg-sev-warning-tint px-3 py-2 text-sm text-sev-warning-strong sm:px-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">ALERT — {lead.locationName}:</span> {lead.message}
      </p>
      <Link href={`/alerts/${lead.id}`} className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2">
        Open
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 hover:bg-black/5"
        aria-label="Hide this banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Permanent, not dismissible. A screenshot of this portal showing live-looking
 * readings for a named rail corridor must never be mistaken for the real thing.
 */
function PrototypeBanner() {
  return (
    <div className="bg-banner px-3 py-1 text-center text-[11px] font-medium text-banner-foreground sm:px-4">
      Design prototype — demonstration data only. No sensors, no alerts and no pump commands are real.{' '}
      <Link href="/coverage" className="underline underline-offset-2">
        Requirements coverage
      </Link>{' '}
      ·{' '}
      <Link href="/design" className="underline underline-offset-2">
        Colour system
      </Link>
    </div>
  );
}
