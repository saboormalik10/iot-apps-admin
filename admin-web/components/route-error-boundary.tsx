'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Shared body for the per-route-group error boundaries (plan §12). Reports to
 * Sentry (when a DSN is set) + structured logs, and offers a recovery action.
 */
export function RouteErrorBoundary({
  error,
  reset,
  group,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  group: string;
}) {
  const t = useTranslations('states');
  const tc = useTranslations('common');

  useEffect(() => {
    logger.error(`Unhandled error in ${group} route group`, error, { digest: error.digest, group });
    Sentry.captureException(error);
  }, [error, group]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-status-error" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('errorTitle')}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t('errorBody')}</p>
        {error.digest ? <p className="text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      </div>
      <Button onClick={reset}>{tc('retry')}</Button>
    </div>
  );
}
