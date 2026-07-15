import { BellRing, CheckCircle2, Cpu, type LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/components/charts/status-badge';
import type { NotificationKind } from '@/lib/api/types';

/**
 * Per-type presentation + deep-linking for notifications (plan §6). The three
 * backend types each get a reserved status tone (always paired with an icon +
 * label, never colour alone — §4) and a deep-link derived from `data`.
 */
export interface NotificationMeta {
  icon: LucideIcon;
  tone: StatusTone;
  label: string;
}

const META: Record<NotificationKind, NotificationMeta> = {
  alert: { icon: BellRing, tone: 'warn', label: 'Alert' },
  session_complete: { icon: CheckCircle2, tone: 'ok', label: 'Session' },
  firmware: { icon: Cpu, tone: 'info', label: 'Firmware' },
};

export function notificationMeta(type: NotificationKind): NotificationMeta {
  return META[type] ?? { icon: BellRing, tone: 'info', label: 'Notice' };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Where a notification deep-links. `alert` → the rule list; `session_complete` →
 * that session's detail; `firmware` → that device's detail (firmware timeline).
 * Falls back to the section landing when the id is missing.
 */
export function notificationLink(n: { type: NotificationKind; data: Record<string, unknown> | null }): string {
  const d = n.data ?? {};
  switch (n.type) {
    case 'session_complete':
      return str(d.sessionId) ? `/sessions/${str(d.sessionId)}` : '/sessions';
    case 'firmware':
      return str(d.deviceId) ? `/devices/${str(d.deviceId)}` : '/devices';
    case 'alert':
    default:
      return '/alerts';
  }
}
