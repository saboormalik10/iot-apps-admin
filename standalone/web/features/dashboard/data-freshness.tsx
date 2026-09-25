'use client';

import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelative, formatDateTime } from '@/lib/time';

const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * "as of …" stamp for the live panels (wind rose, live weather). These panels
 * always show the newest data that EXISTS — which can be days old if the device
 * hasn't synced — so the age must be visible or stale data reads as current.
 * Older than 10 minutes gets an explicit Stale badge.
 */
export function DataFreshness({ tsMs }: { tsMs?: number | null }) {
  if (tsMs == null) return null;
  const stale = Date.now() - tsMs > STALE_AFTER_MS;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={formatDateTime(tsMs)}
    >
      as of {formatRelative(tsMs)}
      {stale ? (
        <Badge variant="warn">
          <Clock className="h-3 w-3" /> Stale
        </Badge>
      ) : null}
    </span>
  );
}
