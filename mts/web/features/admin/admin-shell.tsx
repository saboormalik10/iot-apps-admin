'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useActing } from '@/lib/use-data';

/**
 * Administration is a group of related screens, not one screen with tabs — the
 * audit trail in particular is a named deliverable ("queryable and exportable"),
 * and burying it in a tab makes it look like an afterthought to a client who is
 * buying accountability.
 */
const TABS: { href: string; label: string; superOnly?: boolean }[] = [
  { href: '/admin/organisations', label: 'Organisations', superOnly: true },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/roles', label: 'Roles' },
  { href: '/admin/rules', label: 'Alert rules' },
  { href: '/admin/stations', label: 'Stations' },
  { href: '/admin/sensors', label: 'Sensors' },
  { href: '/admin/recipients', label: 'Recipients' },
  { href: '/admin/audit', label: 'Audit trail' },
  { href: '/admin/system', label: 'System & contract' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isSuperUser } = useActing();
  const tabs = TABS.filter((t) => !t.superOnly || isSuperUser);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperUser
            ? 'Signed in as the Super User — every organisation, its users, stations and sensors, and what each organisation’s Administrator may add.'
            : 'MTS manages users, roles, sensors, thresholds, alert wording and recipients directly — no dependency on us for day-to-day changes.'}
        </p>
      </div>
      <nav aria-label="Administration" className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-primary-strong'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {/* Each tab is its own screen, so it gets its own heading rather than
          leaving five different pages all titled "Administration". */}
      <h2 className="sr-only">{TABS.find((t) => pathname.startsWith(t.href))?.label ?? 'Administration'}</h2>
      {children}
    </div>
  );
}
