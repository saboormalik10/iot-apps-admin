import { BellRing, type LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/components/charts/status-badge';
import type { NotificationKind } from '@/lib/api/types';

/**
 * Per-type presentation + deep-linking for notifications (plan §6). Each
 * backend type gets a reserved status tone (always paired with an icon +
 * label, never colour alone — §4) and a deep-link derived from `data`.
 */
export interface NotificationMeta {
  icon: LucideIcon;
  tone: StatusTone;
  label: string;
}

const META: Record<NotificationKind, NotificationMeta> = {
  alert: { icon: BellRing, tone: 'warn', label: 'Alert' },
};

export function notificationMeta(type: NotificationKind): NotificationMeta {
  return META[type] ?? { icon: BellRing, tone: 'info', label: 'Notice' };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Where a notification deep-links: the device the alert fired on. */
export function notificationLink(n: { type: NotificationKind; data: Record<string, unknown> | null }): string {
  const d = n.data ?? {};
  return str(d.deviceId) ? `/devices/${str(d.deviceId)}` : '/devices';
}
