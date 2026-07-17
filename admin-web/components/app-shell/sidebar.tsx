'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NAV_ITEMS } from './nav-config';
import { useRbac } from '@/lib/rbac/context';
import { isFeatureEnabled } from '@/lib/config/flags';
import { cn } from '@/lib/utils';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations();
  const { can } = useRbac();

  const visible = NAV_ITEMS.filter((item) => {
    if (item.flag && !isFeatureEnabled(item.flag)) return false;
    if (item.capability && !can(item.capability)) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Primary">
      {visible.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary-strong'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
