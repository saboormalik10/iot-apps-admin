'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The four screen states every data surface ships (plan §3.5): loading, empty,
 * error, populated. Reusable so no screen re-invents them.
 */

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const t = useTranslations('states');
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground', className)}
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label ?? t('loadingTitle')}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title?: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('states');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <h3 className="text-sm font-medium">{title ?? t('emptyTitle')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body ?? t('emptyBody')}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations('states');
  const tc = useTranslations('common');
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border py-16 text-center', className)}
    >
      <AlertTriangle className="h-8 w-8 text-status-error" />
      <h3 className="text-sm font-medium">{title ?? t('errorTitle')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body ?? t('errorBody')}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {tc('retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
