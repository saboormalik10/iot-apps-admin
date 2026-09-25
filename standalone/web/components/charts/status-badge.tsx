import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * StatusBadge — a status token that ALWAYS pairs colour with an icon + label
 * (plan §4 a11y rule: never colour alone). The default icon per tone can be
 * overridden; the label text is required.
 */
export type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'offline';

const DEFAULT_ICON: Record<StatusTone, ReactNode> = {
  ok: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  warn: <AlertTriangle className="h-3 w-3" aria-hidden />,
  error: <XCircle className="h-3 w-3" aria-hidden />,
  info: <Info className="h-3 w-3" aria-hidden />,
  offline: <WifiOff className="h-3 w-3" aria-hidden />,
};

export function StatusBadge({
  tone,
  label,
  icon,
  className,
}: {
  tone: StatusTone;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant={tone} className={className}>
      {icon ?? DEFAULT_ICON[tone]}
      <span>{label}</span>
    </Badge>
  );
}
