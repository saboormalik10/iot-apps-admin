'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Fleet health and the data pipeline are two views of "is the system working?". */
const TABS = [
  { href: '/health', label: 'Stations & conditions' },
  { href: '/health/pipeline', label: 'Data pipeline' },
];

export function HealthTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="System health" className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              active ? 'border-primary font-medium text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
