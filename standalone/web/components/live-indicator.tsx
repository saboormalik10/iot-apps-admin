'use client';

import { useTranslations } from 'next-intl';
import { useConnectionStatus } from '@/lib/realtime/provider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Realtime connection status dot (plan §3.2). */
export function LiveIndicator() {
  const status = useConnectionStatus();
  const t = useTranslations('shell');

  const map = {
    connected: { color: 'bg-status-ok', label: t('live'), pulse: true },
    connecting: { color: 'bg-status-warn', label: t('connecting'), pulse: true },
    reconnecting: { color: 'bg-status-warn', label: t('reconnecting'), pulse: true },
    offline: { color: 'bg-status-offline', label: t('offline'), pulse: false },
  } as const;
  const s = map[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5" aria-live="polite">
          <span className={cn('h-2 w-2 rounded-full', s.color, s.pulse && 'animate-pulse-dot')} />
          <span className="hidden text-xs text-muted-foreground md:inline">{s.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{s.label}</TooltipContent>
    </Tooltip>
  );
}
