'use client';

import Link from 'next/link';
import { Activity, Wrench } from 'lucide-react';
import type { LocationId } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * A station is two pages: what it is doing now (the operator's), and how it is
 * built (the maintainer's — drawings, wiring, the equipment list). Kept apart
 * so the live page carries only what an operator acts on.
 */
export function StationTabs({ id, active }: { id: LocationId; active: 'live' | 'installation' }) {
  const tabs = [
    { key: 'live', href: `/stations/${id}`, label: 'Live', icon: Activity },
    { key: 'installation', href: `/stations/${id}/installation`, label: 'Installation', icon: Wrench },
  ] as const;
  return (
    <nav aria-label="Station views" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? 'page' : undefined}
          className={cn(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
            active === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <t.icon className="h-4 w-4" aria-hidden /> {t.label}
        </Link>
      ))}
    </nav>
  );
}
