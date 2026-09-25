import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PaletteRole } from '@/lib/api/scales';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline';

/**
 * StatTile — a headline KPI (a number, not a chart; plan §4). Optional sparkline
 * for the last-N trend (§10.8), optional icon, and an optional deep-link that
 * turns the whole tile into a navigable target (e.g. active-alerts → /alerts).
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  spark,
  sparkRole = 'chart-1',
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  spark?: Array<number | null>;
  sparkRole?: PaletteRole;
  href?: string;
  className?: string;
}) {
  const body = (
    <Card className={cn('flex flex-col gap-1 p-4', href && 'transition-colors hover:bg-accent/40', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums leading-none">{value}</span>
        {spark && spark.length > 1 ? <Sparkline data={spark} role={sparkRole} /> : null}
      </div>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {body}
      </Link>
    );
  }
  return body;
}
